import React, { useEffect, useState } from 'react';

import {
  Play,
  Bookmark,
  Star,
  Check,
  Sparkles,
  Info,
  HelpCircle,
} from 'lucide-react';

import {
  Movie,
  RecommendationResult,
} from '../types';
import { api } from '../services/api';

interface MovieCardProps {
  movie: Movie;
  recommendationDetails?: RecommendationResult;
  isInWatchlist?: boolean;
  userRating?: number;
  onOpenDetails: (movie: Movie) => void;
  onPlayTrailer: (movie: Movie) => void;
  onToggleWatchlist: (movieId: number) => void;
  onRateMovie: (movieId: number, rating: number) => void;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  recommendationDetails,
  isInWatchlist = false,
  userRating,
  onOpenDetails,
  onPlayTrailer,
  onToggleWatchlist,
  onRateMovie,
}) => {
  const [showExplanation, setShowExplanation] = useState(false);

  // Fallback image used when TMDB does not provide a poster
  const fallbackPoster =
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1000&auto=format&fit=crop';

  /*
   * Convert the poster path into a valid image URL.
   *
   * The backend can return either:
   *
   * 1. Full URL
   *    https://image.tmdb.org/t/p/w500/xxxxx.jpg
   *
   * 2. Relative TMDB path
   *    /xxxxx.jpg
   */
  const getPosterUrl = (posterPath?: string | null): string => {
    if (!posterPath) {
      return fallbackPoster;
    }

    // Backend already returned a complete URL
    if (
      posterPath.startsWith('http://') ||
      posterPath.startsWith('https://')
    ) {
      return posterPath;
    }

    // Backend returned only a TMDB image path
    if (posterPath.startsWith('/')) {
      return `https://image.tmdb.org/t/p/w500${posterPath}`;
    }

    // Unknown format
    return fallbackPoster;
  };

  const [posterUrl, setPosterUrl] = useState<string>(
    getPosterUrl(movie.poster_path)
  );
  const [posterRefreshTried, setPosterRefreshTried] = useState(false);

  useEffect(() => {
    setPosterUrl(getPosterUrl(movie.poster_path));
    setPosterRefreshTried(false);
  }, [movie.id, movie.poster_path]);

  const refreshPosterFromTMDB = async () => {
    if (posterRefreshTried) {
      setPosterUrl(fallbackPoster);
      return;
    }

    setPosterRefreshTried(true);

    try {
      const freshMovie = await api.getMovieDetails(movie.id);
      const freshPoster = getPosterUrl(freshMovie.poster_path);

      if (freshPoster !== fallbackPoster) {
        setPosterUrl(freshPoster);
      } else {
        setPosterUrl(fallbackPoster);
      }
    } catch (error) {
      console.warn(
        `Could not refresh poster for ${movie.title}:`,
        error
      );
      setPosterUrl(fallbackPoster);
    }
  };

  const genresList = Array.isArray(movie.genres)
    ? movie.genres.map((genre) =>
        typeof genre === 'string' ? genre : genre.name
      )
    : [];

  const languageLabel = (() => {
    switch (movie.language) {
      case 'kn':
        return 'Kannada';

      case 'ta':
        return 'Tamil';

      case 'te':
        return 'Telugu';

      case 'ml':
        return 'Malayalam';

      case 'hi':
        return 'Hindi';

      default:
        return movie.language
          ? movie.language.toUpperCase()
          : '';
    }
  })();

  return (
    <div
      className="relative group bg-zinc-900/80 border border-zinc-800/80 rounded-xl overflow-hidden shadow-lg transition-all duration-300 hover:scale-[1.03] hover:border-zinc-700 hover:shadow-2xl flex flex-col"
      id={`movie-card-${movie.id}`}
    >
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-950">

        <img
          src={posterUrl}
          alt={movie.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="eager"
          onError={() => {
            void refreshPosterFromTMDB();
          }}
        />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-20">

          <div className="flex items-center gap-1">

            {/* Recommendation Match Badge or TMDB Score */}
            {recommendationDetails ? (
              <div className="bg-red-600/95 text-white font-black text-[11px] px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-red-500/50">
                <Sparkles className="w-3 h-3" />

                {recommendationDetails.confidence_score}% MATCH
              </div>
            ) : (
              <div className="bg-zinc-950/80 backdrop-blur-md text-amber-400 font-bold text-[11px] px-2 py-0.5 rounded-full border border-zinc-800 flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />

                {movie.vote_average.toFixed(1)}
              </div>
            )}

            {/* Language Badge */}
            {movie.language && (
              <div className="bg-zinc-950/80 backdrop-blur-md text-zinc-200 font-extrabold text-[10px] uppercase px-1.5 py-0.5 rounded border border-zinc-700/80">
                {languageLabel}
              </div>
            )}
          </div>

          {/* Quick Bookmark Button */}
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatchlist(movie.id);
            }}
            className={`pointer-events-auto p-1.5 rounded-full backdrop-blur-md transition-transform hover:scale-110 ${
              isInWatchlist
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-zinc-950/80 text-zinc-300 hover:bg-zinc-800'
            }`}
            title={
              isInWatchlist
                ? 'Remove from Library'
                : 'Add to Library'
            }
          >
            {isInWatchlist ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* Hover Action Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 z-10">

          <div className="space-y-2 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">

            <h3 className="text-sm font-bold text-white leading-tight line-clamp-1">
              {movie.title}
            </h3>

            <div className="flex items-center gap-2 text-[11px] text-zinc-300">
              <span>
                {movie.release_date?.substring(0, 4)}
              </span>

              <span>•</span>

              <span className="truncate">
                {genresList.slice(0, 2).join(', ')}
              </span>
            </div>

            {/* Quick Star Rating */}
            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">

              <span className="text-[10px] text-zinc-400">
                Your Rating:
              </span>

              <div className="flex items-center gap-0.5">

                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRateMovie(movie.id, star);
                    }}
                    className={`p-0.5 ${
                      (userRating || 0) >= star
                        ? 'text-amber-400'
                        : 'text-zinc-600 hover:text-amber-400'
                    }`}
                  >
                    <Star
                      className={`w-3 h-3 ${
                        (userRating || 0) >= star
                          ? 'fill-amber-400'
                          : ''
                      }`}
                    />
                  </button>
                ))}

              </div>
            </div>

            {/* Play Trailer & Details Buttons */}
            <div className="flex items-center gap-2 pt-1">

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onPlayTrailer(movie);
                }}
                className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1 transition-colors shadow-md"
              >
                <Play className="w-3 h-3 fill-white" />
                Trailer
              </button>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetails(movie);
                }}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                title="View Full Details"
              >
                <Info className="w-3.5 h-3.5" />
              </button>

            </div>
          </div>
        </div>
      </div>

      {/* Card Footer Info */}
      <div className="p-3 flex-1 flex flex-col justify-between space-y-1">

        <div>
          <h4
            onClick={() => onOpenDetails(movie)}
            className="text-xs font-bold text-zinc-100 hover:text-red-400 transition-colors cursor-pointer line-clamp-1"
          >
            {movie.title}
          </h4>

          <p className="text-[11px] text-zinc-500 line-clamp-1">
            {genresList.slice(0, 2).join(' • ') || 'Movie'}
          </p>
        </div>

        {/* AI Recommendation Explanation */}
        {recommendationDetails && (
          <div className="pt-1.5 border-t border-zinc-800/60 mt-1">

            <div className="flex items-center justify-between text-[10px]">

              <span className="text-zinc-400 font-mono flex items-center gap-1">

                <Sparkles className="w-2.5 h-2.5 text-rose-500" />

                {recommendationDetails.algorithm_used ===
                'content_based'
                  ? 'Cold-Start CB'
                  : recommendationDetails.algorithm_used ===
                      'collaborative_filtering'
                    ? 'Matrix SVD'
                    : 'Meta-Hybrid'}
              </span>

              <button
                onClick={() =>
                  setShowExplanation(!showExplanation)
                }
                className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-0.5"
              >
                Why?

                <HelpCircle className="w-2.5 h-2.5" />
              </button>

            </div>

            {/* Explanation Drawer */}
            {showExplanation && (
              <div className="mt-1.5 p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-300 leading-snug space-y-1 animate-fadeIn">

                <p className="font-semibold text-rose-400">
                  {recommendationDetails.explanation}
                </p>

                {recommendationDetails.matched_reasons.length >
                  0 && (
                  <ul className="list-disc list-inside text-zinc-400 space-y-0.5 pl-1">

                    {recommendationDetails.matched_reasons.map(
                      (reason, index) => (
                        <li
                          key={index}
                          className="line-clamp-1"
                        >
                          {reason}
                        </li>
                      )
                    )}

                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};