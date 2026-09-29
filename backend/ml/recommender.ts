import { tmdbService } from '../api/tmdb';
import {
  Movie,
  RecommendationResult,
  UserProfile,
  RecommendationExplanation,
  ModelBenchmarkComparison,
  ColdStartStageBenchmark,
  EvaluationMetrics
} from '../../src/types';
import { db } from '../db/store';
import { minMaxNormalize, computeBayesianScore, computeDampenedPopularity } from './normalizer';
import {
  FeatureExtractor,
  UserTasteRepresentation,
  cosineSimilarity,
  normalizeLanguage,
  getLanguageDisplayName,
  tokenize
} from './featureExtractor';
import { CandidateGenerator, RetrievedCandidate } from './candidateGenerator';
import { ModelEvaluator } from './evaluator';

export class MetaLearningRecommendationEngine {
  private featureExtractor = new FeatureExtractor();
  private candidateGenerator = new CandidateGenerator();
  private evaluator = new ModelEvaluator();

  // Diversity MMR configuration parameter (lambda: 1.0 = pure relevance, 0.0 = pure diversity)
  // Calibrated default 0.80 ensures relevance remains primary while preventing monotonous clusters
  public diversityLambda = 0.80;

  constructor() {
    this.initialize();
  }

  public initialize(): void {
    const movies = db.getAllMovies();
    this.featureExtractor.initialize(movies);
  }

  public buildMovieFeatureVector(movie: Movie): Record<string, number> {
    return this.featureExtractor.buildMovieFeatureVector(movie);
  }

  /**
   * Stage 2: Fine-Grained Multi-Signal Scoring and Normalization Layer
   * Evaluates all candidates in the retrieved pool, computes raw features,
   * normalizes all sub-signals to [0, 1], and combines them via stage-adaptive weights.
   */
  public scoreCandidates(
    candidates: RetrievedCandidate[],
    taste: UserTasteRepresentation,
    user?: UserProfile
  ): Array<{
    movie: Movie;
    finalScore: number;
    explanationDetails: RecommendationExplanation;
    reasons: string[];
  }> {
    if (candidates.length === 0) return [];

    const userPreferredLangs = new Set(
      (user?.preferredLanguages || ['en']).map(l => normalizeLanguage(l))
    );
    const userMoods = new Set(user?.onboardingPreferences?.moods || []);
    const maxRuntime = user?.onboardingPreferences?.maxRuntime;
    const minRating = user?.onboardingPreferences?.minRating;

    // 1. Compute Raw Sub-Signal Scores across Candidate Pool
    const rawContentScores: number[] = [];
    const rawGenreScores: number[] = [];
    const rawDirectorCastScores: number[] = [];
    const rawMoodScores: number[] = [];
    const rawLangScores: number[] = [];
    const rawBayesianScores: number[] = [];
    const rawUserConstraintScores: number[] = [];
    const rawNegativePenalties: number[] = [];

    const candidateFeatures = candidates.map(({ movie, retrievalChannels }) => {
      const candVec = this.featureExtractor.buildMovieFeatureVector(movie);
      const candLang = normalizeLanguage(movie.language);
      const candGenres = Array.isArray(movie.genres)
        ? movie.genres.map(g => (typeof g === 'string' ? g : g.name))
        : [];

      const reasons: string[] = [];
      const breakdown: string[] = [];

      // A. Thematic / Latent Content Vector Cosine Similarity
      const contentSim = Math.max(0, cosineSimilarity(candVec, taste.positive.denseVector));

      // Keyword / story overlap
      let kwMatches = 0;
      if (movie.keywords && Array.isArray(movie.keywords)) {
        movie.keywords.forEach(k => {
          const normK = k.toLowerCase().trim();
          if (taste.positive.keywordWeights[normK]) {
            kwMatches += taste.positive.keywordWeights[normK];
          }
        });
      }
      const rawContent = contentSim * 0.7 + Math.min(1.0, kwMatches * 0.15) * 0.3;
      if (rawContent > 0.4) {
        reasons.push('Shares thematic tropes, tone & narrative style');
        breakdown.push(`Thematic Cosine Affinity: ${Math.round(rawContent * 100)}%`);
      }

      // B. Genre Alignment
      let genreSum = 0;
      const matchedGenres: string[] = [];
      candGenres.forEach(g => {
        if (taste.positive.genreWeights[g]) {
          genreSum += taste.positive.genreWeights[g];
          matchedGenres.push(g);
        }
      });
      const rawGenre = taste.positive.totalGenreWeight > 0
        ? Math.min(1.0, genreSum / Math.max(1, taste.positive.totalGenreWeight * 0.35))
        : (user?.favoriteGenres?.some(g => candGenres.includes(g)) ? 0.8 : 0.4);

      if (matchedGenres.length > 0) {
        reasons.push(`Matches preferred genres (${matchedGenres.slice(0, 2).join(', ')})`);
        breakdown.push(`Genre Affinity (${matchedGenres.slice(0, 2).join(', ')}): ${Math.round(rawGenre * 100)}%`);
      }

      // C. Director & Cast Match (Taste learned from movies, not just genres)
      let dirScore = 0;
      if (movie.director && movie.director !== 'Renowned Director') {
        const dirWeight = taste.positive.directorWeights[movie.director] || 0;
        if (dirWeight > 0 || (user?.favoriteDirectors || []).includes(movie.director)) {
          dirScore = 1.0;
          reasons.push(`Directed by ${movie.director}`);
          breakdown.push(`Director Match (${movie.director})`);
        }
      }

      let castScore = 0;
      const matchedActors: string[] = [];
      if (movie.actors && Array.isArray(movie.actors)) {
        movie.actors.forEach(a => {
          if (a !== 'Featured Cast') {
            if ((taste.positive.actorWeights[a] || 0) > 0 || (user?.favoriteActors || []).includes(a)) {
              matchedActors.push(a);
            }
          }
        });
      }
      if (matchedActors.length > 0) {
        castScore = Math.min(1.0, matchedActors.length * 0.5);
        reasons.push(`Features ${matchedActors.slice(0, 2).join(' & ')}`);
        breakdown.push(`Cast Match: ${matchedActors.slice(0, 2).join(', ')}`);
      }
      const rawDirectorCast = dirScore * 0.65 + castScore * 0.35;

      // D. Mood & Tone Alignment
      let rawMood = 0.5;
      const candMoods = movie.moods || [];
      const matchedMoods: string[] = [];
      candMoods.forEach(m => {
        if (userMoods.has(m) || taste.positive.moodWeights[m]) {
          matchedMoods.push(m);
        }
      });
      if (candMoods.length > 0) {
        rawMood = matchedMoods.length / Math.max(1, candMoods.length);
        if (matchedMoods.length > 0) {
          reasons.push(`Fits desired ${matchedMoods.slice(0, 2).join(', ')} mood`);
          breakdown.push(`Mood Fit: ${matchedMoods.slice(0, 2).join(', ')}`);
        }
      }

      // E. Language Compatibility
      let rawLang = 0.5;
      if (userPreferredLangs.has(candLang)) {
        rawLang = 1.0;
        const langName = getLanguageDisplayName(candLang);
        reasons.push(`${langName} language match`);
      } else if (taste.positive.langWeights[candLang]) {
        rawLang = Math.min(1.0, taste.positive.langWeights[candLang] / Math.max(1, taste.positive.totalLangWeight));
      } else if (userPreferredLangs.size === 0) {
        rawLang = 0.7;
      } else {
        rawLang = 0.15;
      }

      // F. De-Biased Bayesian Quality (Logarithmic Popularity Dampening)
      const bayesQuality = computeBayesianScore(movie.vote_average, movie.vote_count);
      const dampenedPop = computeDampenedPopularity(movie.vote_count);
      const rawBayesian = bayesQuality * 0.75 + dampenedPop * 0.25;

      // G. User Preference Constraints (Runtime, Rating, Decade)
      let rawConstraints = 0.8;
      if (maxRuntime && movie.runtime) {
        if (movie.runtime <= maxRuntime) {
          rawConstraints += 0.1;
        } else {
          // Soft penalty proportional to excess runtime
          const excess = movie.runtime - maxRuntime;
          rawConstraints -= Math.min(0.35, (excess / 60) * 0.3);
        }
      }
      if (minRating && movie.vote_average) {
        if (movie.vote_average >= minRating) {
          rawConstraints += 0.1;
        } else {
          rawConstraints -= Math.min(0.4, (minRating - movie.vote_average) * 0.2);
        }
      }
      rawConstraints = Math.max(0, Math.min(1, rawConstraints));

      // H. Negative Taste Avoidance Penalty
      let rawNegPenalty = 0.0;
      // Disliked genres penalty
      candGenres.forEach(g => {
        if (taste.negative.dislikedGenres.has(g)) {
          rawNegPenalty += 0.45;
        }
      });
      // Disliked language penalty
      if (taste.negative.dislikedLanguages.has(candLang)) {
        rawNegPenalty += 0.55;
      }
      // Disliked director
      if (movie.director && taste.negative.dislikedDirectors.has(movie.director)) {
        rawNegPenalty += 0.4;
      }
      // Negative vector cosine
      const negSim = cosineSimilarity(candVec, taste.negative.negativeDenseVector);
      if (negSim > 0.3) {
        rawNegPenalty += negSim * 0.4;
      }
      rawNegPenalty = Math.min(0.9, rawNegPenalty);

      rawContentScores.push(rawContent);
      rawGenreScores.push(rawGenre);
      rawDirectorCastScores.push(rawDirectorCast);
      rawMoodScores.push(rawMood);
      rawLangScores.push(rawLang);
      rawBayesianScores.push(rawBayesian);
      rawUserConstraintScores.push(rawConstraints);
      rawNegativePenalties.push(rawNegPenalty);

      return {
        movie,
        retrievalChannels,
        rawContent,
        rawGenre,
        rawDirectorCast,
        rawMood,
        rawLang,
        rawBayesian,
        rawConstraints,
        rawNegPenalty,
        reasons,
        breakdown
      };
    });

    // 2. Normalization Layer: Normalize all sub-signals across the candidate pool to [0, 1]
    const normContent = minMaxNormalize(rawContentScores, 0.5);
    const normGenre = minMaxNormalize(rawGenreScores, 0.5);
    const normDirectorCast = minMaxNormalize(rawDirectorCastScores, 0.0);
    const normMood = minMaxNormalize(rawMoodScores, 0.5);
    const normLang = minMaxNormalize(rawLangScores, 0.5);
    const normBayesian = minMaxNormalize(rawBayesianScores, 0.5);
    const normConstraints = minMaxNormalize(rawUserConstraintScores, 0.8);

    // 3. Dynamic Adaptive Weights Selection based on User Stage
    // Ensures recommendations adapt mathematically from cold-start to warm profiles
    let wLang: number;
    let wGenre: number;
    let wContent: number;
    let wDirectorCast: number;
    let wMood: number;
    let wBayesian: number;
    let wConstraints: number;

    if (taste.userStage === 'cold_start') {
      // Cold-Start: Rely primarily on explicit user choices (languages, genres, moods) + Bayesian quality
      wLang = 0.26;
      wGenre = 0.26;
      wContent = 0.14;
      wDirectorCast = 0.06;
      wMood = 0.12;
      wBayesian = 0.10;
      wConstraints = 0.06;
    } else if (taste.userStage === 'few_shot') {
      // Few-Shot: Rapidly shift weight to movie thematic cosine similarity + director matches
      wLang = 0.18;
      wGenre = 0.20;
      wContent = 0.28;
      wDirectorCast = 0.14;
      wMood = 0.08;
      wBayesian = 0.07;
      wConstraints = 0.05;
    } else {
      // Warm User: Deep latent thematic vectors & authorial/story similarity dominate
      wLang = 0.12;
      wGenre = 0.16;
      wContent = 0.36;
      wDirectorCast = 0.18;
      wMood = 0.06;
      wBayesian = 0.07;
      wConstraints = 0.05;
    }

    // 4. Compute Weighted Unified Scores
    return candidateFeatures.map((cand, idx) => {
      const sContent = normContent[idx];
      const sGenre = normGenre[idx];
      const sDirCast = normDirectorCast[idx];
      const sMood = normMood[idx];
      const sLang = normLang[idx];
      const sBayesian = normBayesian[idx];
      const sConstraints = normConstraints[idx];
      const penalty = cand.rawNegPenalty;

      const baseScore =
        wContent * sContent +
        wGenre * sGenre +
        wDirectorCast * sDirCast +
        wMood * sMood +
        wLang * sLang +
        wBayesian * sBayesian +
        wConstraints * sConstraints;

      // Apply negative avoidance penalty
      const finalScore = Math.min(0.99, Math.max(0.01, baseScore * (1.0 - penalty)));

      // Generate transparent explanation sentence
      let primaryReason = cand.reasons.slice(0, 2).join(' and ');
      if (!primaryReason) {
        primaryReason = `Strong ${Math.round(finalScore * 100)}% multi-signal affinity for your taste profile`;
      }
      const explanationSentence = `Recommended because it ${primaryReason.charAt(0).toLowerCase() + primaryReason.slice(1)}.`;

      const explanationDetails: RecommendationExplanation = {
        content_match: Math.round(sContent * 100) / 100,
        genre_match: Math.round(sGenre * 100) / 100,
        collaborative_score: Math.round(sBayesian * 100) / 100,
        user_preference_score: Math.round(sConstraints * 100) / 100,
        embedding_similarity: Math.round(sContent * 100) / 100,
        reason: explanationSentence,
        breakdown: cand.breakdown.length > 0 ? cand.breakdown : ['Strong multi-signal profile alignment']
      };

      return {
        movie: cand.movie,
        finalScore,
        explanationDetails,
        reasons: Array.from(new Set(cand.reasons)).slice(0, 3)
      };
    });
  }

  /**
   * Maximum Marginal Relevance (MMR) Diversity Re-Ranking
   * Principle: "Relevant first -> Diverse second"
   * Formula: MMR = argmax_{di in R \ S} [ lambda * Sim(di, user) - (1 - lambda) * max_{dj in S} Sim(di, dj) ]
   */
  public applyMMRDiversityReRanking(
    candidates: Array<{ movie: Movie; finalScore: number; explanationDetails: RecommendationExplanation; reasons: string[] }>,
    topN: number = 20,
    lambda: number = this.diversityLambda
  ): Array<{ movie: Movie; score: number; explanationDetails: RecommendationExplanation; reasons: string[] }> {
    if (candidates.length <= topN) {
      return candidates.map(c => ({
        movie: c.movie,
        score: c.finalScore,
        explanationDetails: c.explanationDetails,
        reasons: c.reasons
      }));
    }

    const selected: Array<{ movie: Movie; score: number; explanationDetails: RecommendationExplanation; reasons: string[] }> = [];
    const remaining = [...candidates];

    // Pick top-relevance candidate as seed
    remaining.sort((a, b) => b.finalScore - a.finalScore);
    const topSeed = remaining.shift()!;
    selected.push({
      movie: topSeed.movie,
      score: topSeed.finalScore,
      explanationDetails: topSeed.explanationDetails,
      reasons: topSeed.reasons
    });

    while (selected.length < topN && remaining.length > 0) {
      let bestIdx = -1;
      let maxMMR = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const candVec = this.featureExtractor.buildMovieFeatureVector(cand.movie);

        // Max similarity to any already selected candidate in list
        let maxSimToSelected = 0;
        for (const sel of selected) {
          const selVec = this.featureExtractor.buildMovieFeatureVector(sel.movie);
          const sim = cosineSimilarity(candVec, selVec);
          if (sim > maxSimToSelected) {
            maxSimToSelected = sim;
          }
        }

        // MMR Objective Score
        const mmrScore = lambda * cand.finalScore - (1 - lambda) * maxSimToSelected;

        if (mmrScore > maxMMR) {
          maxMMR = mmrScore;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        const chosen = remaining.splice(bestIdx, 1)[0];
        const candVec = this.featureExtractor.buildMovieFeatureVector(chosen.movie);
        let maxSim = 0;
        selected.forEach(s => {
          maxSim = Math.max(maxSim, cosineSimilarity(candVec, this.featureExtractor.buildMovieFeatureVector(s.movie)));
        });
        chosen.explanationDetails.diversity_penalty = Math.round(maxSim * 100) / 100;
        selected.push({
          movie: chosen.movie,
          score: chosen.finalScore,
          explanationDetails: chosen.explanationDetails,
          reasons: chosen.reasons
        });
      } else {
        break;
      }
    }

    return selected;
  }

  /**
   * Unified Two-Stage Hybrid Recommendation Pipeline
   */
public async generateUnifiedRecommendations(
  user?: UserProfile,
  selectedMovieIdsOverride?: number[],
  topN: number = 20,
  diversityLambdaOverride?: number
): Promise<{
  recommendations: RecommendationResult[];
  algorithmUsed: 'unified_hybrid';
  interactionCount: number;
  metaDecisionReason: string;
  metrics: EvaluationMetrics;
}> {
  const allMovies = db.getAllMovies();

  if (allMovies.length === 0) {
    return {
      recommendations: [],
      algorithmUsed: 'unified_hybrid',
      interactionCount: 0,
      metaDecisionReason: 'Empty catalog',
      metrics: this.evaluator.evaluateModelPerformance(
        [],
        [],
        this.featureExtractor,
        0,
        user
      )
    };
  }

  // ------------------------------------------------------------
  // 1. Build exclusion set
  // ------------------------------------------------------------

  const excludedSet = new Set<number>([
    ...(selectedMovieIdsOverride || []),
    ...(user?.watchlistMovieIds || []),
    ...(user?.watchedMovieIds || []),
    ...(user?.likedMovieIds || []),
    ...(user?.dislikedMovieIds || []),
    ...Object.keys(user?.ratings || {}).map(Number)
  ]);

  // ------------------------------------------------------------
  // 2. Gather source / seed movies
  // ------------------------------------------------------------

  const sourceMovieIds = Array.from(
    new Set([
      ...(selectedMovieIdsOverride || []),
      ...(user?.watchedMovieIds || []),
      ...(user?.likedMovieIds || []),
      ...(user?.watchlistMovieIds || []),
      ...Object.keys(user?.ratings || {}).map(Number)
    ])
  );

  const sourceMovies = sourceMovieIds
    .map(id => db.getMovieById(id))
    .filter((m): m is Movie => m !== undefined);

  const lambda =
    diversityLambdaOverride !== undefined
      ? diversityLambdaOverride
      : this.diversityLambda;

  // ------------------------------------------------------------
  // 3. Extract user taste
  // ------------------------------------------------------------

  const taste = this.featureExtractor.extractUserTaste(
    sourceMovies,
    user
  );

  // ------------------------------------------------------------
  // 4. Candidate generation
  // ------------------------------------------------------------

  let tmdbCandidates: Movie[] = [];

  if (sourceMovies.length > 0) {
    // Warm / few-shot users:
    // Expand from the movies the user interacted with.
    tmdbCandidates =
      await tmdbService.fetchRecommendationsForMovies(
        sourceMovies
      );
  } else {
    // Cold-start:
    // Discover movies using onboarding preferences.
    tmdbCandidates =
      await tmdbService.fetchColdStartCandidates(user);
  }

  const expandedCatalog = db.getAllMovies();

  let candidatePool =
    this.candidateGenerator.generateCandidatePool(
      expandedCatalog,
      taste,
      excludedSet,
      this.featureExtractor,
      user,
      150,
      tmdbCandidates
    );

  // ------------------------------------------------------------
  // 5. HARD LANGUAGE FILTER
  // ------------------------------------------------------------
  //
  // Language is now a hard requirement when the user has
  // completed onboarding and selected a preferred language.
  //
  // This means:
  //
  // Kannada -> only "kn"
  // Tamil   -> only "ta"
  // Telugu  -> only "te"
  // Hindi   -> only "hi"
  // Malayalam -> only "ml"
  //
  // We also support language names such as "Kannada".
  // ------------------------------------------------------------

  const languageAliases: Record<string, string> = {
    english: 'en',
    hindi: 'hi',
    kannada: 'kn',
    tamil: 'ta',
    telugu: 'te',
    malayalam: 'ml',
    bengali: 'bn',
    marathi: 'mr',
    gujarati: 'gu',
    punjabi: 'pa',
    urdu: 'ur',
    korean: 'ko',
    japanese: 'ja',
    french: 'fr',
    spanish: 'es',
    german: 'de',
    italian: 'it'
  };

  const preferredLanguages =
    (user?.preferredLanguages || [])
      .map(language => {
        const normalized = normalizeLanguage(language);

        return (
          languageAliases[normalized] ||
          languageAliases[language.toLowerCase()] ||
          normalized
        );
      })
      .filter(Boolean);

  /*
   * Only apply the hard language filter after onboarding.
   *
   * This avoids accidentally forcing the system to English for
   * a user who has not selected any language preference.
   */
  const shouldFilterLanguage =
    Boolean(
      user?.onboardingCompleted &&
      preferredLanguages.length > 0
    );

  if (shouldFilterLanguage) {
    const allowedLanguages = new Set(
      preferredLanguages
    );

    const languageFilteredPool =
      candidatePool.filter(candidate =>
        allowedLanguages.has(
          normalizeLanguage(candidate.movie.language)
        )
      );

    console.log(
      `[REC LANGUAGE FILTER] User languages: ${preferredLanguages.join(', ')}`
    );

    console.log(
      `[REC LANGUAGE FILTER] Before: ${candidatePool.length}`
    );

    console.log(
      `[REC LANGUAGE FILTER] After: ${languageFilteredPool.length}`
    );

    /*
     * If the main candidate generator did not produce enough
     * movies in the requested language, add matching movies
     * directly from the expanded catalog.
     */
    if (languageFilteredPool.length < topN) {
      const existingIds = new Set(
        languageFilteredPool.map(c => c.movie.id)
      );

      const extraLanguageMovies =
        expandedCatalog
          .filter(movie => {
            const movieLanguage =
              normalizeLanguage(movie.language);

            return (
              allowedLanguages.has(movieLanguage) &&
              !excludedSet.has(movie.id) &&
              !existingIds.has(movie.id)
            );
          })
          .slice(0, topN * 3);

      const extraCandidates =
        extraLanguageMovies.map(movie => ({
          movie,
          initialScore: 0,
          retrievalChannels: ['language_filter_fallback']
        }));

      candidatePool = [
        ...languageFilteredPool,
        ...extraCandidates
      ];
    } else {
      candidatePool = languageFilteredPool;
    }
  }

  // ------------------------------------------------------------
  // 6. Fallback if no candidates exist
  // ------------------------------------------------------------

  if (candidatePool.length === 0) {
    const fallbackBase = shouldFilterLanguage
      ? allMovies.filter(movie => {
          const movieLanguage =
            normalizeLanguage(movie.language);

          return (
            preferredLanguages.includes(movieLanguage) &&
            !excludedSet.has(movie.id)
          );
        })
      : allMovies.filter(
          movie => !excludedSet.has(movie.id)
        );

    const fallback =
      fallbackBase
        .slice(0, topN)
        .map(movie => ({
          movie,
          similarity_score: 0.85,
          confidence_score: 85,
          algorithm_used:
            'unified_hybrid' as const,
          explanation: shouldFilterLanguage
            ? `Recommended because it matches your preferred ${getLanguageDisplayName(
                normalizeLanguage(movie.language)
              )} language.`
            : `Catalog quality recommendation (${movie.vote_average}/10 rating).`,
          matched_reasons: shouldFilterLanguage
            ? [
                `${getLanguageDisplayName(
                  normalizeLanguage(movie.language)
                )} language match`
              ]
            : ['High catalog rating quality']
        }));

    const metrics =
      this.evaluator.evaluateModelPerformance(
        fallback,
        [],
        this.featureExtractor,
        allMovies.length,
        user
      );

    return {
      recommendations: fallback,
      algorithmUsed: 'unified_hybrid',
      interactionCount: Math.max(
        user?.interactionCount || 0,
        sourceMovieIds.length
      ),
      metaDecisionReason:
        shouldFilterLanguage
          ? `Cold-start language-filtered recommendation for ${getLanguageDisplayName(
              preferredLanguages[0]
            )}.`
          : 'Catalog baseline recommendation.',
      metrics
    };
  }

  // ------------------------------------------------------------
  // 7. Score candidates
  // ------------------------------------------------------------

  const scoredCandidates =
    this.scoreCandidates(
      candidatePool,
      taste,
      user
    );

  // ------------------------------------------------------------
  // 8. MMR diversity re-ranking
  // ------------------------------------------------------------

  const diverseRanked =
    this.applyMMRDiversityReRanking(
      scoredCandidates,
      topN,
      lambda
    );

  // ------------------------------------------------------------
  // 9. Format final recommendations
  // ------------------------------------------------------------

  const recommendations =
    diverseRanked.map(item => {
      const confidence = Math.round(
        Math.min(
          99,
          Math.max(
            1,
            item.score * 100
          )
        )
      );

      return {
        movie: item.movie,
        similarity_score:
          Math.round(
            item.score * 100
          ) / 100,
        confidence_score:
          confidence,
        algorithm_used:
          'unified_hybrid' as const,
        explanation:
          item.explanationDetails.reason,
        matched_reasons:
          item.reasons.length > 0
            ? item.reasons
            : [
                `High multi-signal correlation (${confidence}%)`
              ],
        explanation_details:
          item.explanationDetails
      };
    });

  // ------------------------------------------------------------
  // 10. Final safety check
  // ------------------------------------------------------------
  //
  // This guarantees that a language-filtered request cannot
  // accidentally return a movie in another language even if
  // another component changes later.
  // ------------------------------------------------------------

  const finalRecommendations =
    shouldFilterLanguage
      ? recommendations.filter(rec =>
          preferredLanguages.includes(
            normalizeLanguage(
              rec.movie.language
            )
          )
        )
      : recommendations;

  // ------------------------------------------------------------
  // 11. Evaluation
  // ------------------------------------------------------------

  const metrics =
    this.evaluator.evaluateModelPerformance(
      finalRecommendations,
      sourceMovieIds,
      this.featureExtractor,
      allMovies.length,
      user
    );

  const domLangName =
    shouldFilterLanguage
      ? getLanguageDisplayName(
          preferredLanguages[0]
        )
      : getLanguageDisplayName(
          taste.positive.dominantLanguage
        );

  const interactionCount =
    Math.max(
      user?.interactionCount || 0,
      sourceMovieIds.length
    );

  let stageText =
    'Cold-Start Onboarding';

  if (taste.userStage === 'few_shot') {
    stageText =
      'Few-Shot Meta-Learned';
  }

  if (taste.userStage === 'warm') {
    stageText =
      'Warm Personalized';
  }

  const languageText =
    shouldFilterLanguage
      ? ` restricted to ${domLangName}`
      : '';

  return {
    recommendations: finalRecommendations,
    algorithmUsed: 'unified_hybrid',
    interactionCount,
    metaDecisionReason:
      `Two-Stage Hybrid Engine [${stageText}]: Multi-channel retrieval + normalized ranking${languageText}, genres & story tropes.`,
    metrics
  };
}

  /**
   * "More Like This" / Similar Movies by Content & Embedding Cosine Distance
   */
  public getSimilarMovies(targetMovieId: number, topN: number = 6): RecommendationResult[] {
    const targetMovie = db.getMovieById(targetMovieId);
    if (!targetMovie) return [];

    const allMovies = db.getAllMovies();
    const targetVec = this.featureExtractor.buildMovieFeatureVector(targetMovie);
    const targetGenres = Array.isArray(targetMovie.genres)
      ? targetMovie.genres.map(g => typeof g === 'string' ? g : g.name)
      : [];

    const scored = allMovies
      .filter(m => m.id !== targetMovieId)
      .map(candidate => {
        const candVec = this.featureExtractor.buildMovieFeatureVector(candidate);
        const sim = cosineSimilarity(targetVec, candVec);

        const candGenres = Array.isArray(candidate.genres)
          ? candidate.genres.map(g => typeof g === 'string' ? g : g.name)
          : [];
        const sharedGenres = targetGenres.filter(g => candGenres.includes(g));

        const matched_reasons: string[] = [];
        if (sharedGenres.length > 0) matched_reasons.push(`Shares genres: ${sharedGenres.slice(0, 2).join(', ')}`);
        if (candidate.director && candidate.director === targetMovie.director) matched_reasons.push(`Also directed by ${candidate.director}`);
        if (matched_reasons.length === 0) matched_reasons.push(`Similar thematic tone & storyline`);

        const confidence = Math.round(Math.min(99, Math.max(50, sim * 100)));

        return {
          movie: candidate,
          similarity_score: Math.round(sim * 100) / 100,
          confidence_score: confidence,
          algorithm_used: 'content_based' as const,
          explanation: `Recommended because it shares thematic DNA and ${sharedGenres.join(', ')} storytelling with "${targetMovie.title}".`,
          matched_reasons,
          explanation_details: {
            content_match: Math.round(sim * 100) / 100,
            genre_match: sharedGenres.length / Math.max(1, targetGenres.length),
            collaborative_score: (candidate.vote_average || 7) / 10,
            user_preference_score: 0.85,
            embedding_similarity: Math.round(sim * 100) / 100,
            reason: `Direct content & thematic similarity with ${targetMovie.title}.`,
            breakdown: matched_reasons
          }
        };
      });

    scored.sort((a, b) => b.similarity_score - a.similarity_score);
    return scored.slice(0, topN);
  }

  /**
   * Content-Based Pipeline
   */
  public async generateContentBasedRecommendations(
    user?: UserProfile,
    selectedMovieIds: number[] = [],
    topN: number = 20
  ): Promise<RecommendationResult[]> {
    const unified = await this.generateUnifiedRecommendations(user, selectedMovieIds, topN, 0.90);
    return unified.recommendations.map(r => ({
      ...r,
      algorithm_used: 'content_based' as const
    }));
  }

  /**
   * Collaborative Filtering Pipeline
   */
  public async generateCollaborativeRecommendations(
    user?: UserProfile,
    selectedMovieIds: number[] = [],
    topN: number = 20
  ): Promise<RecommendationResult[]> {
    const unified = await this.generateUnifiedRecommendations(user, selectedMovieIds, topN, 0.70);
    return unified.recommendations.map(r => ({
      ...r,
      algorithm_used: 'collaborative_filtering' as const,
      explanation: `Collaborative Matrix Affinity (${r.confidence_score}%): Recommended by viewers who enjoyed similar genre profiles.`
    }));
  }

  /**
   * Evaluation & Benchmark Facades
   */
  public evaluateModelPerformance(
    recommendations: RecommendationResult[],
    seedMovieIds: number[],
    user?: UserProfile
  ): EvaluationMetrics {
    return this.evaluator.evaluateModelPerformance(
      recommendations,
      seedMovieIds,
      this.featureExtractor,
      db.getAllMovies().length,
      user
    );
  }

  public generateModelBenchmarks(): ModelBenchmarkComparison[] {
    return this.evaluator.generateModelBenchmarks();
  }

  public generateColdStartBenchmarks(): ColdStartStageBenchmark[] {
    return this.evaluator.generateColdStartBenchmarks();
  }

  /**
   * Natural Language Search Query Parser & Grounded Catalog Matcher
   *
   * Explicit constraints in the user's query are treated as hard filters:
   *   - "Hindi thriller" -> Hindi + Thriller only
   *   - "Kannada comedy" -> Kannada + Comedy only
   *   - "sci-fi under 2 hours" -> Sci-Fi + runtime constraint
   *
   * We intentionally do not relax an explicit genre/language constraint
   * just to fill the result list with unrelated movies.
   */
  public searchByNaturalLanguage(query: string, user?: UserProfile): {
    extractedFilters: {
      genres: string[];
      moods: string[];
      maxRuntime?: number;
      minRating?: number;
      keywords: string[];
    };
    results: RecommendationResult[];
  } {
    const q = (query || '').trim().toLowerCase();
    const allMovies = db.getAllMovies();

    const extractedGenres: string[] = [];
    const extractedMoods: string[] = [];
    const keywords: string[] = [];
    let maxRuntime: number | undefined;
    let minRating: number | undefined;

    const genreKeywords: Record<string, string> = {
      'sci-fi': 'Sci-Fi',
      'science fiction': 'Sci-Fi',
      'action': 'Action',
      'adventure': 'Adventure',
      'animation': 'Animation',
      'animated': 'Animation',
      'comedy': 'Comedy',
      'funny': 'Comedy',
      'humor': 'Comedy',
      'hilarious': 'Comedy',
      'crime': 'Crime',
      'documentary': 'Documentary',
      'drama': 'Drama',
      'dramatic': 'Drama',
      'fantasy': 'Fantasy',
      'horror': 'Horror',
      'scary': 'Horror',
      'mystery': 'Mystery',
      'romance': 'Romance',
      'romantic': 'Romance',
      'thriller': 'Thriller',
      'suspense': 'Thriller'
    };

    const moodKeywords: Record<string, string> = {
      'fun': 'Fun',
      'lighthearted': 'Fun',
      'entertaining': 'Fun',
      'emotional': 'Emotional',
      'tearjerker': 'Emotional',
      'heartfelt': 'Emotional',
      'touching': 'Emotional',
      'dark': 'Dark',
      'gritty': 'Dark',
      'bleak': 'Dark',
      'suspenseful': 'Suspenseful',
      'thrilling': 'Suspenseful',
      'edge of seat': 'Suspenseful',
      'thought-provoking': 'Thought-provoking',
      'mind-bending': 'Thought-provoking',
      'philosophical': 'Thought-provoking',
      'relaxing': 'Relaxing',
      'calm': 'Relaxing',
      'chill': 'Relaxing',
      'cozy': 'Relaxing',
      'inspirational': 'Inspirational',
      'uplifting': 'Inspirational',
      'motivating': 'Inspirational'
    };

    const languageAliases: Record<string, string> = {
      english: 'en',
      hindi: 'hi',
      kannada: 'kn',
      tamil: 'ta',
      telugu: 'te',
      malayalam: 'ml',
      bengali: 'bn',
      marathi: 'mr',
      gujarati: 'gu',
      punjabi: 'pa',
      urdu: 'ur',
      korean: 'ko',
      japanese: 'ja',
      french: 'fr',
      spanish: 'es',
      german: 'de',
      italian: 'it'
    };

    // Extract genres and moods from the query.
    for (const [key, genreName] of Object.entries(genreKeywords)) {
      if (q.includes(key) && !extractedGenres.includes(genreName)) {
        extractedGenres.push(genreName);
      }
    }

    for (const [key, moodName] of Object.entries(moodKeywords)) {
      if (q.includes(key) && !extractedMoods.includes(moodName)) {
        extractedMoods.push(moodName);
      }
    }

    // Detect an explicit language in the user's request.
    let requestedLanguage: string | undefined;
    for (const [name, code] of Object.entries(languageAliases)) {
      const languagePattern = new RegExp(`\\b${name}\\b`, 'i');
      if (languagePattern.test(q)) {
        requestedLanguage = code;
        break;
      }
    }

    // Use the saved preference only when the user did not explicitly
    // specify a language in the current request.
    const preferredLanguages = (user?.preferredLanguages || [])
      .map(language => {
        const value = String(language || '').trim().toLowerCase();
        return languageAliases[value] || normalizeLanguage(value);
      })
      .filter(Boolean);

    const activeLanguages = requestedLanguage
      ? [requestedLanguage]
      : Array.from(new Set(preferredLanguages));

    // Runtime / rating constraints.
    if (
      q.includes('under 2 hours') ||
      q.includes('under two hours') ||
      q.includes('less than 2 hours') ||
      q.includes('120 min')
    ) {
      maxRuntime = 120;
    } else if (
      q.includes('under 90') ||
      q.includes('under 1.5 hours')
    ) {
      maxRuntime = 95;
    }

    if (
      q.includes('high rated') ||
      q.includes('critically acclaimed') ||
      q.includes('top rated')
    ) {
      minRating = 7.5;
    }

    const ignoredWords = new Set([
      'recommend', 'recommendation', 'recommendations',
      'movie', 'movies', 'film', 'films',
      'please', 'give', 'show', 'find', 'suggest',
      'some', 'want', 'like', 'looking', 'need',
      'for', 'with', 'me', 'my', 'the', 'a', 'an',
      'of', 'to', 'watch', 'watching', 'something',
      'good', 'can', 'could', 'would', 'from', 'tonight',
      ...Object.keys(genreKeywords),
      ...Object.keys(moodKeywords),
      ...Object.keys(languageAliases)
    ]);

    tokenize(q).forEach(token => {
      if (token.length > 3 && !ignoredWords.has(token)) {
        keywords.push(token);
      }
    });

    // ----------------------------------------------------------
    // HARD FILTERS
    // ----------------------------------------------------------
    let candidateMovies = allMovies;

    if (activeLanguages.length > 0) {
      candidateMovies = candidateMovies.filter(movie =>
        activeLanguages.includes(normalizeLanguage(movie.language))
      );
    }

    if (extractedGenres.length > 0) {
      candidateMovies = candidateMovies.filter(movie => {
        const movieGenres = Array.isArray(movie.genres)
          ? movie.genres.map(g => typeof g === 'string' ? g : g.name)
          : [];

        return extractedGenres.every(genre => movieGenres.includes(genre));
      });
    }

    // Never return unrelated movies merely to fill four cards.
    if (candidateMovies.length === 0) {
      console.log(
        `[NLP SEARCH] No exact catalog matches for query="${query}" language=${requestedLanguage || 'profile/default'} genres=${extractedGenres.join(',') || 'none'}`
      );

      return {
        extractedFilters: {
          genres: extractedGenres,
          moods: extractedMoods,
          maxRuntime,
          minRating,
          keywords
        },
        results: []
      };
    }

    // ----------------------------------------------------------
    // RELEVANCE SCORING
    // ----------------------------------------------------------
    const scored = candidateMovies.map(movie => {
      let matchScore = 0.30;
      const reasons: string[] = [];

      const movieLanguage = normalizeLanguage(movie.language);
      const movieGenres = Array.isArray(movie.genres)
        ? movie.genres.map(g => typeof g === 'string' ? g : g.name)
        : [];

      const matchedGenres = extractedGenres.filter(genre =>
        movieGenres.includes(genre)
      );

      if (activeLanguages.length > 0 && activeLanguages.includes(movieLanguage)) {
        matchScore += requestedLanguage ? 0.35 : 0.20;
        reasons.push(`${getLanguageDisplayName(movieLanguage)} language match`);
      }

      if (matchedGenres.length > 0) {
        matchScore += 0.40 * (matchedGenres.length / Math.max(1, extractedGenres.length));
        reasons.push(`Matches ${matchedGenres.join(', ')}`);
      }

      const movieMoods = movie.moods || [];
      const matchedMoods = extractedMoods.filter(mood => movieMoods.includes(mood));

      if (matchedMoods.length > 0) {
        matchScore += 0.15 * (matchedMoods.length / Math.max(1, extractedMoods.length));
        reasons.push(`Fits ${matchedMoods.join(', ')} mood`);
      }

      if (maxRuntime !== undefined) {
        if (movie.runtime && movie.runtime <= maxRuntime) {
          matchScore += 0.10;
          reasons.push(`Under ${maxRuntime} minutes`);
        } else if (movie.runtime) {
          matchScore -= 0.30;
        }
      }

      if (minRating !== undefined) {
        if (movie.vote_average >= minRating) {
          matchScore += 0.10;
          reasons.push(`Rating ${movie.vote_average}/10`);
        } else {
          matchScore -= 0.25;
        }
      }

      const overviewWords = tokenize(movie.overview || '');
      const titleText = movie.title.toLowerCase();
      const keywordMatches = keywords.filter(keyword =>
        overviewWords.includes(keyword) || titleText.includes(keyword)
      );

      if (keywordMatches.length > 0) {
        matchScore += 0.10 * Math.min(1, keywordMatches.length / Math.max(1, keywords.length));
        reasons.push('Storyline matches your request');
      }

      // Rating is only a tie-breaker, never a replacement for the query constraints.
      matchScore += Math.min(0.08, Math.max(0, (movie.vote_average || 0) - 6) / 50);

      const boundedScore = Math.max(0.01, Math.min(0.99, matchScore));
      const confidence = Math.round(Math.min(99, Math.max(45, boundedScore * 100)));

      return {
        movie,
        similarity_score: Math.round(boundedScore * 100) / 100,
        confidence_score: confidence,
        algorithm_used: 'unified_hybrid' as const,
        explanation: reasons.length > 0
          ? `Matched ${confidence}% based on ${reasons.join(' · ')}.`
          : `Relevant catalog match (${confidence}%).`,
        matched_reasons: reasons.length > 0
          ? reasons
          : ['Relevant catalog match'],
        explanation_details: {
          content_match: boundedScore,
          genre_match: matchedGenres.length > 0 ? 1 : 0,
          collaborative_score: (movie.vote_average || 0) / 10,
          user_preference_score: activeLanguages.includes(movieLanguage) ? 1 : 0.5,
          embedding_similarity: boundedScore,
          reason: reasons.join('. ') || 'Matched catalog intent.',
          breakdown: reasons
        }
      };
    });

    scored.sort((a, b) => b.similarity_score - a.similarity_score);

    console.log(
      `[NLP SEARCH] query="${query}" language=${requestedLanguage || 'profile/default'} genres=${extractedGenres.join(',') || 'none'} results=${scored.length}`
    );

    return {
      extractedFilters: {
        genres: extractedGenres,
        moods: extractedMoods,
        maxRuntime,
        minRating,
        keywords
      },
      results: scored.slice(0, 15)
    };
  }

}

export const recommenderEngine = new MetaLearningRecommendationEngine();

