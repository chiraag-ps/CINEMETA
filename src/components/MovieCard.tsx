import React, { useState } from 'react';
import {
  Play,
  Bookmark,
  Star,
  Check,
  Info,
  ChevronDown,
} from 'lucide-react';
import { Movie, RecommendationResult } from '../types';

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
  const [showWhy, setShowWhy] = useState(false);

  const fallbackPoster =
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1000&auto=format&fit=crop';

  const getPosterUrl = (posterPath?: string | null): string => {
    if (!posterPath) return fallbackPoster;

    if (
      posterPath.startsWith('http://') ||
      posterPath.startsWith('https://')
    ) {
      return posterPath;
    }

    if (posterPath.startsWith('/')) {
      return `https://image.tmdb.org/t/p/w500${posterPath}`;
    }

    return fallbackPoster;
  };

  const posterUrl = getPosterUrl(movie.poster_path);

  const genresList = Array.isArray(movie.genres)
    ? movie.genres.map((genre) =>
        typeof genre === 'string' ? genre : genre.name
      )
    : [];

  const year = movie.release_date?.substring(0, 4) || '';

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-900/55 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:bg-zinc-900"
      id={`movie-card-${movie.id}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-zinc-950">
        <img
          src={posterUrl}
          alt={movie.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
          onError={(event) => {
            const img = event.currentTarget;

            if (img.dataset.fallbackApplied !== 'true') {
              img.dataset.fallbackApplied = 'true';
              img.src = fallbackPoster;
            }
          }}
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <div className="rounded-md bg-black/65 px-2 py-1 text-[11px] font-semibold text-amber-300 backdrop-blur-sm">
            ★ {movie.vote_average.toFixed(1)}
          </div>

          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggleWatchlist(movie.id);
            }}
            className={`rounded-full p-2 backdrop-blur-sm transition-colors ${
              isInWatchlist
                ? 'bg-emerald-600 text-white'
                : 'bg-black/60 text-zinc-200 hover:bg-black/80'
            }`}
            title={isInWatchlist ? 'Remove from My List' : 'Add to My List'}
          >
            {isInWatchlist ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black via-black/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="w-full translate-y-2 space-y-2 transition-transform duration-300 group-hover:translate-y-0">
            <div>
              <h3 className="line-clamp-2 text-sm font-semibold text-white">
                {movie.title}
              </h3>

              <p className="mt-1 text-[11px] text-zinc-300">
                {year}
                {genresList.length > 0
                  ? ` • ${genresList.slice(0, 2).join(', ')}`
                  : ''}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onPlayTrailer(movie);
                }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-semibold text-zinc-900 transition-colors hover:bg-zinc-200"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Trailer
              </button>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetails(movie);
                }}
                className="rounded-lg bg-zinc-900/85 p-2 text-zinc-100 transition-colors hover:bg-zinc-800"
                title="More details"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-3">
        <div>
          <button
            onClick={() => onOpenDetails(movie)}
            className="line-clamp-1 text-left text-sm font-semibold text-zinc-100 transition-colors hover:text-red-400"
          >
            {movie.title}
          </button>

          <p className="mt-1 line-clamp-1 text-[11px] text-zinc-500">
            {genresList.slice(0, 2).join(' • ') || 'Movie'}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800/70 pt-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500">Your rating</span>

            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => onRateMovie(movie.id, star)}
                className="p-0.5 text-zinc-600 transition-colors hover:text-amber-400"
                title={`Rate ${star} out of 5`}
              >
                <Star
                  className={`h-3 w-3 ${
                    (userRating || 0) >= star
                      ? 'fill-amber-400 text-amber-400'
                      : ''
                  }`}
                />
              </button>
            ))}
          </div>

          {recommendationDetails && (
            <button
              onClick={() => setShowWhy((value) => !value)}
              className="flex items-center gap-1 text-[10px] font-medium text-zinc-400 transition-colors hover:text-white"
            >
              Why this pick?
              <ChevronDown
                className={`h-3 w-3 transition-transform ${
                  showWhy ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}
        </div>

        {recommendationDetails && showWhy && (
          <div className="animate-fadeIn rounded-lg bg-zinc-950/70 p-2.5 text-[10px] leading-relaxed text-zinc-400">
            <p className="font-medium text-zinc-200">
              {recommendationDetails.explanation}
            </p>

            {recommendationDetails.matched_reasons.length > 0 && (
              <p className="mt-1 text-zinc-500">
                {recommendationDetails.matched_reasons
                  .slice(0, 2)
                  .join(' • ')}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
};
