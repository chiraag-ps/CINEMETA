import {
  Movie,
  UserProfile
} from '../../src/types';

import {
  UserTasteRepresentation,
  FeatureExtractor,
  cosineSimilarity,
  normalizeLanguage
} from './featureExtractor';

import {
  computeBayesianScore
} from './normalizer';

export interface RetrievedCandidate {
  movie: Movie;
  retrievalChannels: string[];
  initialScore: number;
}

interface CandidateAccumulator {
  movie: Movie;
  channels: Set<string>;
  initialScore: number;
}

export class CandidateGenerator {

  /**
   * Stage 1 — Multi-Channel Candidate Retrieval
   *
   * Retrieval channels:
   *
   * 1. Thematic / semantic similarity
   * 2. Explicit user preferences
   * 3. Meta-learning positive/negative taste prototype
   * 4. Bayesian quality prior
   * 5. Live TMDb expansion
   *
   * Stage 2 is responsible for the final ranking.
   */
  public generateCandidatePool(
    allMovies: Movie[],
    taste: UserTasteRepresentation,
    excludedSet: Set<number>,
    featureExtractor: FeatureExtractor,
    user?: UserProfile,
    poolSize: number = 150,
    tmdbCandidates: Movie[] = []
  ): RetrievedCandidate[] {

    const candidateMap = new Map<number, CandidateAccumulator>();

    // ------------------------------------------------------------
    // Configuration
    // ------------------------------------------------------------

    const safePoolSize = Math.max(
      1,
      Math.min(poolSize, 500)
    );

    const validCatalog = allMovies.filter(
      movie =>
        movie &&
        typeof movie.id === 'number' &&
        !excludedSet.has(movie.id)
    );

    if (validCatalog.length === 0) {
      console.log(
        '[CANDIDATE PIPELINE LOG] No eligible catalog movies.'
      );

      return [];
    }

    console.log(
      `[CANDIDATE PIPELINE LOG] Stage 1 started. ` +
      `Catalog=${validCatalog.length}, ` +
      `TMDbCandidates=${tmdbCandidates.length}, ` +
      `TargetPool=${safePoolSize}`
    );

    // ------------------------------------------------------------
    // User preference preparation
    // ------------------------------------------------------------

    const userPreferredLangs = new Set<string>(
      (user?.preferredLanguages || [])
        .map(language => normalizeLanguage(language))
        .filter(Boolean)
    );

    const hasExplicitLanguages =
      userPreferredLangs.size > 0;

    const userGenres = new Set<string>(
      (user?.favoriteGenres || [])
        .map(genre => String(genre).trim())
        .filter(Boolean)
    );

    const userMoods = new Set<string>(
      (user?.onboardingPreferences?.moods || [])
        .map(mood => String(mood).trim())
        .filter(Boolean)
    );

    // ------------------------------------------------------------
    // Utility helpers
    // ------------------------------------------------------------

    const clamp01 = (value: number): number => {
      if (!Number.isFinite(value)) {
        return 0;
      }

      return Math.max(
        0,
        Math.min(1, value)
      );
    };

    const addCandidate = (
      movie: Movie,
      channel: string,
      score: number
    ): void => {

      if (
        !movie ||
        typeof movie.id !== 'number' ||
        excludedSet.has(movie.id)
      ) {
        return;
      }

      const normalizedScore = clamp01(score);

      const existing = candidateMap.get(movie.id);

      if (!existing) {
        candidateMap.set(movie.id, {
          movie,
          channels: new Set<string>([channel]),
          initialScore: normalizedScore
        });

        return;
      }

      existing.channels.add(channel);

      existing.initialScore = Math.max(
        existing.initialScore,
        normalizedScore
      );
    };

    // ============================================================
    // CHANNEL 1
    // THEMATIC / SEMANTIC CONTENT
    // ============================================================

    const scoredContent = validCatalog.map(movie => {

      const movieVector =
        featureExtractor.buildMovieFeatureVector(movie);

      const similarity = cosineSimilarity(
        movieVector,
        taste.positive.denseVector
      );

      return {
        movie,
        similarity: clamp01(similarity)
      };
    });

    scoredContent.sort(
      (a, b) =>
        b.similarity - a.similarity
    );

    const thematicLimit = Math.min(
      100,
      scoredContent.length
    );

    scoredContent
      .slice(0, thematicLimit)
      .forEach(({ movie, similarity }) => {
        addCandidate(
          movie,
          'thematic_content',
          similarity
        );
      });

    console.log(
      `[CANDIDATE PIPELINE LOG] ` +
      `Channel 1 semantic retrieval: ${thematicLimit}`
    );

    // ============================================================
    // CHANNEL 2
    // EXPLICIT USER PREFERENCES
    // ============================================================

    const scoredAttributes = validCatalog.map(movie => {

      let score = 0;

      const movieGenres: string[] =
        Array.isArray(movie.genres)
          ? movie.genres
              .map(genre =>
                typeof genre === 'string'
                  ? genre
                  : genre?.name
              )
              .filter(Boolean)
          : [];

      const movieLanguage =
        normalizeLanguage(movie.language);

      // ----------------------------------------------------------
      // Genre
      // ----------------------------------------------------------

      movieGenres.forEach(genre => {

        if (userGenres.has(genre)) {
          score += 1.5;
        }

        if (
          taste.positive.genreWeights &&
          taste.positive.genreWeights[genre]
        ) {
          score += Math.min(
            1.5,
            Number(
              taste.positive.genreWeights[genre]
            ) || 0
          );
        }

        if (
          taste.negative.dislikedGenres &&
          taste.negative.dislikedGenres.has(genre)
        ) {
          score -= 3.0;
        }
      });

      // ----------------------------------------------------------
      // Language
      // ----------------------------------------------------------

      if (
        hasExplicitLanguages &&
        userPreferredLangs.has(movieLanguage)
      ) {
        score += 2.0;
      }

      if (
        taste.negative.dislikedLanguages &&
        taste.negative.dislikedLanguages.has(movieLanguage)
      ) {
        score -= 4.0;
      }

      // ----------------------------------------------------------
      // Mood
      // ----------------------------------------------------------

      if (
        Array.isArray(movie.moods) &&
        movie.moods.length > 0
      ) {

        movie.moods.forEach(mood => {

          if (userMoods.has(mood)) {
            score += 1.0;
          }

          if (
            taste.positive.moodWeights &&
            taste.positive.moodWeights[mood]
          ) {
            score += Math.min(
              1.0,
              Number(
                taste.positive.moodWeights[mood]
              ) || 0
            );
          }
        });
      }

      // ----------------------------------------------------------
      // Runtime
      // ----------------------------------------------------------

      const maxRuntime =
        user?.onboardingPreferences?.maxRuntime;

      if (
        typeof maxRuntime === 'number' &&
        maxRuntime > 0 &&
        typeof movie.runtime === 'number' &&
        movie.runtime > 0
      ) {

        if (movie.runtime <= maxRuntime) {
          score += 0.5;
        } else {
          score -= 1.0;
        }
      }

      return {
        movie,
        score
      };
    });

    scoredAttributes.sort(
      (a, b) =>
        b.score - a.score
    );

    const attributeLimit = Math.min(
      80,
      scoredAttributes.length
    );

    scoredAttributes
      .slice(0, attributeLimit)
      .forEach(({ movie, score }) => {

        if (score <= 0) {
          return;
        }

        /*
         * Explicit preference scores can exceed 5 because
         * multiple genres/moods may contribute.
         *
         * Normalize conservatively so this channel cannot
         * overwhelm Stage 2.
         */
        const normalizedScore =
          clamp01(score / 7.0);

        addCandidate(
          movie,
          'explicit_preference',
          normalizedScore
        );
      });

    console.log(
      `[CANDIDATE PIPELINE LOG] ` +
      `Channel 2 explicit preference retrieval: ${attributeLimit}`
    );

    // ============================================================
    // CHANNEL 3
    // META-LEARNING PROTOTYPE
    // ============================================================

    if (taste.totalHistoryCount > 0) {

      const scoredMeta = validCatalog.map(movie => {

        const movieVector =
          featureExtractor.buildMovieFeatureVector(movie);

        const positiveSimilarity =
          cosineSimilarity(
            movieVector,
            taste.positive.denseVector
          );

        const negativeSimilarity =
          cosineSimilarity(
            movieVector,
            taste.negative.negativeDenseVector
          );

        /*
         * Positive taste is rewarded.
         *
         * Negative taste is explicitly penalized.
         *
         * 0.70 prevents the negative profile from completely
         * dominating the positive profile.
         */
        const netSimilarity =
          positiveSimilarity -
          0.70 * negativeSimilarity;

        return {
          movie,
          netSimilarity
        };
      });

      scoredMeta.sort(
        (a, b) =>
          b.netSimilarity -
          a.netSimilarity
      );

      const metaLimit = Math.min(
        70,
        scoredMeta.length
      );

      scoredMeta
        .slice(0, metaLimit)
        .forEach(({ movie, netSimilarity }) => {

          if (netSimilarity <= 0.05) {
            return;
          }

          addCandidate(
            movie,
            'meta_learning_prototype',
            clamp01(netSimilarity)
          );
        });

      console.log(
        `[CANDIDATE PIPELINE LOG] ` +
        `Channel 3 meta-learning retrieval: ${metaLimit}`
      );

    } else {

      console.log(
        '[CANDIDATE PIPELINE LOG] ' +
        'Channel 3 skipped: no interaction history.'
      );
    }

    // ============================================================
    // CHANNEL 4
    // BAYESIAN QUALITY PRIOR
    // ============================================================

    const scoredBayesian = validCatalog.map(movie => {

      const bayesianScore =
        computeBayesianScore(
          Number(movie.vote_average) || 0,
          Number(movie.vote_count) || 0
        );

      return {
        movie,
        bayesianScore: clamp01(bayesianScore)
      };
    });

    scoredBayesian.sort(
      (a, b) =>
        b.bayesianScore -
        a.bayesianScore
    );

    const bayesianLimit = Math.min(
      60,
      scoredBayesian.length
    );

    scoredBayesian
      .slice(0, bayesianLimit)
      .forEach(({ movie, bayesianScore }) => {

        addCandidate(
          movie,
          'bayesian_quality',
          bayesianScore
        );
      });

    console.log(
      `[CANDIDATE PIPELINE LOG] ` +
      `Channel 4 Bayesian quality retrieval: ${bayesianLimit}`
    );

    // ============================================================
    // CHANNEL 5
    // LIVE TMDb EXPANSION
    // ============================================================

    /*
     * TMDb is an additional retrieval source.
     *
     * It does NOT bypass the recommendation engine.
     *
     * Every TMDb movie is:
     *
     * 1. validated
     * 2. deduplicated
     * 3. checked against exclusions
     * 4. compared against the user's semantic profile
     * 5. combined with Bayesian quality
     * 6. passed into the same Stage 2 ranking system
     */

    const validTmdbCandidates =
      tmdbCandidates.filter(movie =>
        movie &&
        typeof movie.id === 'number' &&
        !excludedSet.has(movie.id)
      );

    const uniqueTmdbCandidates =
      Array.from(
        new Map(
          validTmdbCandidates.map(
            movie => [movie.id, movie]
          )
        ).values()
      );

    let tmdbAddedCount = 0;
    let tmdbMergedCount = 0;

    uniqueTmdbCandidates.forEach(movie => {

      let semanticSimilarity = 0;

      try {

        const movieVector =
          featureExtractor.buildMovieFeatureVector(
            movie
          );

        semanticSimilarity =
          clamp01(
            cosineSimilarity(
              movieVector,
              taste.positive.denseVector
            )
          );

      } catch (error) {

        console.warn(
          `[CANDIDATE PIPELINE LOG] ` +
          `Unable to calculate TMDb semantic similarity ` +
          `for movie ${movie.id}:`,
          error
        );
      }

      const bayesianScore =
        clamp01(
          computeBayesianScore(
            Number(movie.vote_average) || 0,
            Number(movie.vote_count) || 0
          )
        );

      /*
       * TMDb retrieval score:
       *
       * 70% semantic alignment
       * 30% Bayesian quality
       *
       * This keeps TMDb useful for cold-start expansion while
       * preventing popularity alone from dominating.
       */
      const tmdbInitialScore =
        clamp01(
          semanticSimilarity * 0.70 +
          bayesianScore * 0.30
        );

      const existed =
        candidateMap.has(movie.id);

      addCandidate(
        movie,
        'tmdb_expansion',
        tmdbInitialScore
      );

      if (existed) {
        tmdbMergedCount++;
      } else {
        tmdbAddedCount++;
      }
    });

    console.log(
      `[CANDIDATE PIPELINE LOG] Channel 5 TMDb expansion: ` +
      `${uniqueTmdbCandidates.length} unique, ` +
      `${tmdbAddedCount} new, ` +
      `${tmdbMergedCount} merged.`
    );

    // ============================================================
    // CONSOLIDATE CANDIDATES
    // ============================================================

    const candidates: RetrievedCandidate[] =
      Array.from(candidateMap.values())
        .map(item => ({
          movie: item.movie,
          retrievalChannels:
            Array.from(item.channels),
          initialScore:
            clamp01(item.initialScore)
        }));

    // ------------------------------------------------------------
    // Multi-channel bonus
    // ------------------------------------------------------------

    /*
     * A movie retrieved independently by several channels is
     * stronger than one retrieved by only one channel.
     *
     * We add a small capped bonus here.
     *
     * Stage 2 still performs the actual ranking.
     */

    candidates.forEach(candidate => {

      const channelCount =
        candidate.retrievalChannels.length;

      if (channelCount <= 1) {
        return;
      }

      const multiChannelBonus =
        Math.min(
          0.12,
          (channelCount - 1) * 0.03
        );

      candidate.initialScore =
        clamp01(
          candidate.initialScore +
          multiChannelBonus
        );
    });

    // ------------------------------------------------------------
    // Sort
    // ------------------------------------------------------------

    candidates.sort(
      (a, b) => {

        const scoreDifference =
          b.initialScore -
          a.initialScore;

        if (
          Math.abs(scoreDifference) >
          0.000001
        ) {
          return scoreDifference;
        }

        /*
         * Stable secondary ordering.
         *
         * Higher quality movies win ties.
         */
        const ratingDifference =
          (Number(b.movie.vote_average) || 0) -
          (Number(a.movie.vote_average) || 0);

        if (
          Math.abs(ratingDifference) >
          0.000001
        ) {
          return ratingDifference;
        }

        return (
          (Number(b.movie.popularity) || 0) -
          (Number(a.movie.popularity) || 0)
        );
      }
    );

    const finalCandidates =
      candidates.slice(
        0,
        safePoolSize
      );

    // ============================================================
    // DIAGNOSTICS
    // ============================================================

    const channelCounts =
      new Map<string, number>();

    finalCandidates.forEach(candidate => {

      candidate.retrievalChannels.forEach(
        channel => {

          channelCounts.set(
            channel,
            (channelCounts.get(channel) || 0) + 1
          );
        }
      );
    });

    const tmdbFinalCount =
      finalCandidates.filter(candidate =>
        candidate.retrievalChannels.includes(
          'tmdb_expansion'
        )
      ).length;

    console.log(
      `[CANDIDATE PIPELINE LOG] ` +
      `Stage 1 complete. ` +
      `Unique=${candidates.length}, ` +
      `FinalPool=${finalCandidates.length}, ` +
      `TMDbInFinalPool=${tmdbFinalCount}`
    );

    console.log(
      '[CANDIDATE PIPELINE LOG] ' +
      'Retrieval channel distribution:',
      Object.fromEntries(channelCounts)
    );

    return finalCandidates;
  }
}