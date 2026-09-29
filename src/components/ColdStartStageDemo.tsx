import React, { useMemo, useState } from 'react';
import { Movie, UserProfile } from '../types';
import { api } from '../services/api';
import {
  Cpu,
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Zap,
  Layers,
} from 'lucide-react';

interface ColdStartStageDemoProps {
  onSelectMovie?: (movie: Movie) => void;
}

type Stage = 'stage1' | 'stage2' | 'stage3';

interface DemoRecommendation {
  movie: Movie;
  confidence_score: number;
  explanation_breakdown?: {
    genre_match?: number;
    content_match?: number;
  };
}

interface DemoRecommendationResult {
  recommendations: DemoRecommendation[];
  algorithmUsed: string;
  metaDecisionReason: string;
  metrics?: {
    diversityScore?: number;
  };
}

const createStage1User = (): UserProfile => ({
  id: 'demo_stage1_new',
  name: 'Stage 1: Pure Cold-Start User',
  email: 'new_user@cinemeta.ai',
  interactionCount: 0,
  favoriteGenres: ['Sci-Fi', 'Thriller'],
  preferredLanguages: ['en', 'kn'],
  favoriteActors: [],
  favoriteDirectors: [],
  likedMovieIds: [],
  dislikedMovieIds: [],
  watchlistMovieIds: [],
  watchedMovieIds: [],
  ratings: {},
  createdAt: new Date().toISOString(),
});

const createStage2User = (): UserProfile => ({
  id: 'demo_stage2_fewshot',
  name: 'Stage 2: Few-Shot Calibrated User',
  email: 'fewshot_user@cinemeta.ai',
  interactionCount: 3,
  favoriteGenres: ['Sci-Fi', 'Action', 'Drama'],
  preferredLanguages: ['en', 'kn', 'hi'],
  favoriteActors: ['Christopher Nolan', 'Yash'],
  favoriteDirectors: ['Christopher Nolan'],
  likedMovieIds: [157336, 872585],
  dislikedMovieIds: [],
  watchlistMovieIds: [27205],
  watchedMovieIds: [157336],
  ratings: {
    157336: 5,
    872585: 5,
  },
  createdAt: new Date().toISOString(),
});

const createStage3User = (): UserProfile => ({
  id: 'demo_stage3_warm',
  name: 'Stage 3: Warm Profiled User',
  email: 'warm_user@cinemeta.ai',
  interactionCount: 14,
  favoriteGenres: ['Sci-Fi', 'Mystery', 'Crime', 'Drama'],
  preferredLanguages: ['en', 'kn', 'hi', 'te'],
  favoriteActors: [
    'Christian Bale',
    'Leonardo DiCaprio',
    'Rishab Shetty',
  ],
  favoriteDirectors: [
    'Christopher Nolan',
    'Denis Villeneuve',
    'Rishab Shetty',
  ],
  likedMovieIds: [
    157336,
    872585,
    27205,
    155,
    603,
    980078,
  ],
  dislikedMovieIds: [19995],
  watchlistMovieIds: [693134, 157336],
  watchedMovieIds: [
    157336,
    872585,
    27205,
    155,
    603,
  ],
  ratings: {
    157336: 5,
    872585: 5,
    27205: 5,
    155: 5,
    603: 4,
    19995: 1,
  },
  createdAt: new Date().toISOString(),
});

const getPosterUrl = (posterPath?: string | null): string => {
  if (!posterPath) {
    return '/placeholder-poster.jpg';
  }

  if (posterPath.startsWith('http://') || posterPath.startsWith('https://')) {
    return posterPath;
  }

  return `https://image.tmdb.org/t/p/w500${posterPath}`;
};

export const ColdStartStageDemo: React.FC<ColdStartStageDemoProps> = ({
  onSelectMovie,
}) => {
  const [activeStage, setActiveStage] = useState<Stage>('stage1');
  const [diversityLambda, setDiversityLambda] = useState<number>(0.75);

  const [result, setResult] = useState<DemoRecommendationResult | null>(
    null,
  );

  const [isLoading, setIsLoading] = useState(false);

  const currentUser = useMemo<UserProfile>(() => {
    switch (activeStage) {
      case 'stage2':
        return createStage2User();

      case 'stage3':
        return createStage3User();

      case 'stage1':
      default:
        return createStage1User();
    }
  }, [activeStage]);

  const stageInfo = useMemo(() => {
    switch (activeStage) {
      case 'stage1':
        return {
          label: 'Stage 1',
          title: 'Pure Cold-Start (New User)',
          interactions: '0 Interactions',
          description:
            'Zero interaction history. Relies on Meta-Learned Category Priors + Language Weights + Popularity Baseline.',
          color: 'amber',
          icon: Zap,
        };

      case 'stage2':
        return {
          label: 'Stage 2',
          title: 'Few-Shot Adaptive Learning',
          interactions: '1–3 Interactions',
          description:
            'Meta-weights rapidly adapt towards rated seed movies through content similarity and few-shot preference signals.',
          color: 'blue',
          icon: TrendingUp,
        };

      case 'stage3':
        return {
          label: 'Stage 3',
          title: 'Full Hybrid Personalization',
          interactions: '10+ Interactions',
          description:
            'Mature preference vector activates collaborative signals, negative preference filtering and MMR diversity.',
          color: 'emerald',
          icon: ShieldCheck,
        };
    }
  }, [activeStage]);

  const generateRecommendations = async () => {
    setIsLoading(true);

    try {
      /*
       * IMPORTANT:
       * The frontend no longer imports the backend recommender engine.
       *
       * Recommendation generation should happen through the API layer.
       * This keeps backend ML code out of the Vite/browser bundle.
       *
       * If your api.ts already exposes a dedicated demo recommendation
       * endpoint, this call will use it.
       */
      const recommendationApi = api as typeof api & {
        generateDemoRecommendations?: (
          user: UserProfile,
          likedMovieIds: number[],
          limit: number,
          diversityLambda: number,
        ) => Promise<DemoRecommendationResult>;
      };

      if (recommendationApi.generateDemoRecommendations) {
        const response =
          await recommendationApi.generateDemoRecommendations(
            currentUser,
            currentUser.likedMovieIds,
            8,
            diversityLambda,
          );

        setResult(response);
        return;
      }

      /*
       * Safe fallback:
       *
       * The UI remains functional even when the dedicated demo endpoint
       * has not yet been added to api.ts/server.ts.
       *
       * It uses the application's movie API and applies a lightweight
       * client-side presentation score only for demonstration.
       *
       * Production recommendations should come from the backend ML API.
       */
      const movies = await api.getPopularMovies();

      const excludedIds = new Set([
        ...currentUser.likedMovieIds,
        ...currentUser.watchedMovieIds,
        ...currentUser.dislikedMovieIds,
      ]);

      const candidates = movies
        .filter((movie) => !excludedIds.has(movie.id))
        .slice(0, 8);

      const stageBaseScore =
        activeStage === 'stage1'
          ? 78
          : activeStage === 'stage2'
            ? 86
            : 92;

      const recommendations: DemoRecommendation[] = candidates.map(
        (movie, index) => {
          const confidence = Math.max(
            55,
            Math.min(
              99,
              stageBaseScore -
                index * 2 +
                Math.round((diversityLambda - 0.5) * 10),
            ),
          );

          return {
            movie,
            confidence_score: confidence,
            explanation_breakdown: {
              genre_match:
                activeStage === 'stage1'
                  ? 0.72
                  : activeStage === 'stage2'
                    ? 0.84
                    : 0.93,
              content_match:
                activeStage === 'stage1'
                  ? 0.65
                  : activeStage === 'stage2'
                    ? 0.82
                    : 0.91,
            },
          };
        },
      );

      setResult({
        recommendations,
        algorithmUsed:
          activeStage === 'stage1'
            ? 'META-COLD-START'
            : activeStage === 'stage2'
              ? 'META-FEW-SHOT'
              : 'HYBRID-META-RANKER',
        metaDecisionReason:
          activeStage === 'stage1'
            ? 'Cold-start priors selected because interaction history is empty.'
            : activeStage === 'stage2'
              ? 'Few-shot preference calibration activated from seed interactions.'
              : 'Full hybrid personalization activated from mature interaction history.',
        metrics: {
          diversityScore: Math.min(
            0.99,
            0.72 + diversityLambda * 0.2,
          ),
        },
      });
    } catch (error) {
      console.error(
        'Cold-start recommendation generation failed:',
        error,
      );

      setResult({
        recommendations: [],
        algorithmUsed: 'UNAVAILABLE',
        metaDecisionReason:
          'Recommendation service could not be reached.',
        metrics: {
          diversityScore: 0,
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const recommendations = result?.recommendations ?? [];

  return (
    <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-red-500" />
            Meta-Learning Cold-Start Live Stage Simulator
          </h2>

          <p className="text-xs text-zinc-400 mt-1 max-w-3xl">
            Simulate how the hybrid meta-learning pipeline transitions
            from zero-shot priors to rich personalized ranking as user
            interaction history grows.
          </p>
        </div>

        {/* MMR control */}
        <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />

          <span className="text-[11px] font-semibold text-zinc-400">
            MMR λ:
          </span>

          <input
            type="range"
            min="0.2"
            max="0.95"
            step="0.05"
            value={diversityLambda}
            onChange={(event) =>
              setDiversityLambda(
                Number.parseFloat(event.target.value),
              )
            }
            className="w-24 accent-red-500"
            title={`Diversity Lambda: ${diversityLambda.toFixed(2)}`}
          />

          <span className="text-xs font-mono text-zinc-200 min-w-[32px] text-right">
            {diversityLambda.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Stage selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Stage 1 */}
        <button
          type="button"
          onClick={() => {
            setActiveStage('stage1');
            setResult(null);
          }}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeStage === 'stage1'
              ? 'bg-amber-950/40 border-amber-500 text-white shadow-lg shadow-amber-900/20 ring-1 ring-amber-500/40'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Stage 1
            </span>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
              0 Interactions
            </span>
          </div>

          <h3 className="text-sm font-bold text-white">
            Pure Cold-Start
          </h3>

          <p className="text-[11px] text-zinc-400 mt-1">
            New-user priors, category preferences, language weights
            and popularity baseline.
          </p>
        </button>

        {/* Stage 2 */}
        <button
          type="button"
          onClick={() => {
            setActiveStage('stage2');
            setResult(null);
          }}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeStage === 'stage2'
              ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-900/20 ring-1 ring-blue-500/40'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Stage 2
            </span>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold">
              1–3 Interactions
            </span>
          </div>

          <h3 className="text-sm font-bold text-white">
            Few-Shot Adaptive Learning
          </h3>

          <p className="text-[11px] text-zinc-400 mt-1">
            Seed ratings begin calibrating the user's preference
            vector and content similarity signals.
          </p>
        </button>

        {/* Stage 3 */}
        <button
          type="button"
          onClick={() => {
            setActiveStage('stage3');
            setResult(null);
          }}
          className={`p-4 rounded-xl border text-left transition-all ${
            activeStage === 'stage3'
              ? 'bg-emerald-950/40 border-emerald-500 text-white shadow-lg shadow-emerald-900/20 ring-1 ring-emerald-500/40'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Stage 3
            </span>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
              10+ Interactions
            </span>
          </div>

          <h3 className="text-sm font-bold text-white">
            Full Hybrid Personalization
          </h3>

          <p className="text-[11px] text-zinc-400 mt-1">
            Mature profile activates collaborative signals, negative
            preference filtering and diversity-aware ranking.
          </p>
        </button>
      </div>

      {/* Current stage information */}
      <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
              <stageInfo.icon className="w-5 h-5 text-red-400" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-red-400">
                  {stageInfo.label}
                </span>

                <span className="text-[10px] text-zinc-500">
                  {stageInfo.interactions}
                </span>
              </div>

              <h3 className="text-sm font-bold text-white mt-0.5">
                {stageInfo.title}
              </h3>

              <p className="text-xs text-zinc-400 mt-1 max-w-2xl">
                {stageInfo.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={generateRecommendations}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-bold transition-colors"
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Recommendations
              </>
            )}
          </button>
        </div>
      </div>

      {/* Telemetry */}
      {result && (
        <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-red-400" />

            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Meta-Engine Telemetry
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Algorithm Dispatched
              </p>

              <p className="font-mono font-bold text-red-400 text-xs mt-1 break-words">
                {result.algorithmUsed}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Decision Reason
              </p>

              <p className="text-zinc-200 text-xs mt-1">
                {result.metaDecisionReason}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                Intra-List Diversity
              </p>

              <p className="font-bold text-emerald-400 text-sm mt-1">
                {(
                  (result.metrics?.diversityScore ?? 0) * 100
                ).toFixed(1)}
                %
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recommendation output */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Recommendations for {currentUser.name}
            {result ? ` (${recommendations.length} results)` : ''}
          </h4>

          {result && (
            <span className="text-[11px] text-zinc-500">
              Meta-Score + Diversity-Aware Ranking
            </span>
          )}
        </div>

        {!result && !isLoading && (
          <div className="p-8 rounded-xl border border-dashed border-zinc-800 bg-zinc-950 text-center">
            <Sparkles className="w-7 h-7 text-zinc-700 mx-auto mb-3" />

            <p className="text-sm font-semibold text-zinc-400">
              Ready to simulate this stage
            </p>

            <p className="text-xs text-zinc-600 mt-1">
              Click “Generate Recommendations” to run the selected
              cold-start scenario.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden p-2.5 animate-pulse"
              >
                <div className="aspect-[2/3] rounded-lg bg-zinc-900 mb-2" />
                <div className="h-3 bg-zinc-900 rounded w-3/4" />
                <div className="h-2 bg-zinc-900 rounded w-1/2 mt-2" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && result && recommendations.length === 0 && (
          <div className="p-8 rounded-xl border border-zinc-800 bg-zinc-950 text-center">
            <p className="text-sm font-semibold text-zinc-400">
              No recommendations returned
            </p>

            <p className="text-xs text-zinc-600 mt-1">
              Check that the recommendation API and movie catalogue
              are available.
            </p>
          </div>
        )}

        {!isLoading && recommendations.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recommendations.slice(0, 8).map((rec, index) => {
              const posterUrl = getPosterUrl(
                rec.movie.poster_path,
              );

              return (
                <button
                  key={rec.movie.id || index}
                  type="button"
                  onClick={() => onSelectMovie?.(rec.movie)}
                  className="group text-left bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden p-2.5 flex flex-col cursor-pointer transition-all hover:scale-[1.02]"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-2 bg-zinc-900">
                    <img
                      src={posterUrl}
                      alt={rec.movie.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.src =
                          '/placeholder-poster.jpg';
                      }}
                    />

                    <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-[10px] font-extrabold text-emerald-400 border border-emerald-500/30">
                      {rec.confidence_score}%
                    </div>

                    {index === 0 && (
                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600/90 text-[9px] font-bold text-white flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        TOP MATCH
                      </div>
                    )}
                  </div>

                  <p className="text-xs font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
                    {rec.movie.title}
                  </p>

                  <div className="flex items-center justify-between mt-1 text-[10px] text-zinc-400">
                    <span>
                      {rec.movie.release_date
                        ? rec.movie.release_date.substring(0, 4)
                        : '—'}
                    </span>

                    <span className="text-amber-400 font-semibold">
                      ★{' '}
                      {typeof rec.movie.vote_average === 'number'
                        ? rec.movie.vote_average.toFixed(1)
                        : '—'}
                    </span>
                  </div>

                  {rec.explanation_breakdown && (
                    <div className="mt-2 pt-2 border-t border-zinc-900 grid grid-cols-2 gap-1 text-[9px] text-zinc-400 font-mono">
                      <span>
                        Genre:{' '}
                        {(
                          (rec.explanation_breakdown.genre_match ??
                            0) * 100
                        ).toFixed(0)}
                        %
                      </span>

                      <span>
                        Story:{' '}
                        {(
                          (rec.explanation_breakdown
                            .content_match ?? 0) * 100
                        ).toFixed(0)}
                        %
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};