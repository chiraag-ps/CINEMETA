import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Bookmark,
  Star,
  Check,
  Heart,
  ThumbsDown,
  Eye,
  ExternalLink,
  Tv,
  MessageSquare,
  Send,
  Sparkles,
  Film,
  Calendar,
  Clock,
  Globe,
  TrendingUp,
  Cpu,
  Layers,
  ChevronRight
} from 'lucide-react';
import { Movie, UserReview, OTTProvider, WatchProvidersResponse, MovieTrailerResult, RecommendationResult } from '../types';
import { api } from '../services/api';
import { getImageUrl } from '../data/mockMovies';

interface MovieDetailModalProps {
  movie: Movie | null;
  isInWatchlist: boolean;
  isLiked?: boolean;
  isDisliked?: boolean;
  isWatched?: boolean;
  userRating?: number;
  recommendationExplanation?: string;
  explanationBreakdown?: any;
  onClose: () => void;
  onSelectMovie?: (movie: Movie) => void;
  onPlayTrailer?: (movie: Movie) => void;
  onToggleWatchlist: (movieId: number) => void;
  onToggleLike?: (movieId: number) => void;
  onToggleDislike?: (movieId: number) => void;
  onToggleWatched?: (movieId: number) => void;
  onRateMovie: (movieId: number, rating: number) => void;
}

export const MovieDetailModal: React.FC<MovieDetailModalProps> = ({
  movie,
  isInWatchlist,
  isLiked = false,
  isDisliked = false,
  isWatched = false,
  userRating,
  recommendationExplanation,
  explanationBreakdown,
  onClose,
  onSelectMovie,
  onPlayTrailer,
  onToggleWatchlist,
  onToggleLike,
  onToggleDislike,
  onToggleWatched,
  onRateMovie
}) => {
  const [detailedMovie, setDetailedMovie] = useState<Movie | null>(movie);
  const [reviews, setReviews] = useState<UserReview[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newRating, setNewRating] = useState<number>(userRating || 5);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Similar Movies ("More Like This")
  const [similarMovies, setSimilarMovies] = useState<RecommendationResult[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  // OTT Watch Providers State
  const [selectedRegion, setSelectedRegion] = useState<'IN' | 'US' | 'GB'>('IN');
  const [providersData, setProvidersData] = useState<WatchProvidersResponse | null>(null);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Trailer Video State
  const [showEmbeddedTrailer, setShowEmbeddedTrailer] = useState(false);
  const [trailerData, setTrailerData] = useState<MovieTrailerResult | null>(null);
  const [loadingTrailer, setLoadingTrailer] = useState(false);

  // Local interaction states for instant UI feedback
  const [liked, setLiked] = useState(isLiked);
  const [disliked, setDisliked] = useState(isDisliked);
  const [watched, setWatched] = useState(isWatched);
  const [inWatchlist, setInWatchlist] = useState(isInWatchlist);
  const [rating, setRating] = useState<number | undefined>(userRating);

  useEffect(() => {
    setLiked(isLiked);
    setDisliked(isDisliked);
    setWatched(isWatched);
    setInWatchlist(isInWatchlist);
    setRating(userRating);
  }, [isLiked, isDisliked, isWatched, isInWatchlist, userRating]);

  useEffect(() => {
    setDetailedMovie(movie);
    setShowEmbeddedTrailer(false);

    if (movie) {
      // 1. Fetch Reviews
      api.getMovieReviews(movie.id)
        .then(res => setReviews(res))
        .catch(err => console.warn('Could not load reviews:', err));

      // 2. Fetch Detailed Metadata
      api.getMovieDetails(movie.id)
        .then(fullMovie => {
          if (fullMovie) setDetailedMovie(fullMovie);
        })
        .catch(err => console.warn('Could not load movie details:', err));

      // 3. Fetch OTT Watch Providers
      loadWatchProviders(movie.id, selectedRegion);

      // 4. Fetch YouTube Trailer Info
      setLoadingTrailer(true);
      api.getMovieTrailer(movie.id)
        .then(data => setTrailerData(data))
        .catch(err => console.warn('Could not load trailer:', err))
        .finally(() => setLoadingTrailer(false));

      // 5. Fetch "More Like This" Similar Movies
      setLoadingSimilar(true);
      api.getSimilarMovies(movie.id, 6)
        .then(sim => setSimilarMovies(sim))
        .catch(err => console.warn('Could not load similar movies:', err))
        .finally(() => setLoadingSimilar(false));
    }
  }, [movie]);

  const loadWatchProviders = (movieId: number, region: string) => {
    setLoadingProviders(true);
    api.getWatchProviders(movieId, region)
      .then(res => setProvidersData(res))
      .catch(err => console.warn('Could not load OTT providers:', err))
      .finally(() => setLoadingProviders(false));
  };

  const handleRegionChange = (newRegion: 'IN' | 'US' | 'GB') => {
    setSelectedRegion(newRegion);
    if (movie) {
      loadWatchProviders(movie.id, newRegion);
    }
  };

  if (!movie) return null;

  const displayMovie = detailedMovie || movie;
  const backdropUrl = getImageUrl(displayMovie.backdrop_path, 'original');
  const posterUrl = getImageUrl(displayMovie.poster_path, 'w500');
  const genresList = Array.isArray(displayMovie.genres)
    ? displayMovie.genres.map(g => typeof g === 'string' ? g : (g as any).name)
    : [];

  const handleAddReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmittingReview(true);
    try {
      const added = await api.addReview(movie.id, newRating, newComment);
      setReviews([added, ...reviews]);
      setNewComment('');
      setRating(newRating);
      onRateMovie(movie.id, newRating);
    } catch (err) {
      console.error('Review submit error:', err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleToggleLike = async () => {
    const nextState = !liked;
    setLiked(nextState);
    if (nextState) setDisliked(false);
    if (onToggleLike) onToggleLike(movie.id);
    else await api.toggleLike(movie.id);
  };

  const handleToggleDislike = async () => {
    const nextState = !disliked;
    setDisliked(nextState);
    if (nextState) setLiked(false);
    if (onToggleDislike) onToggleDislike(movie.id);
    else await api.toggleDislike(movie.id);
  };

  const handleToggleWatchlist = async () => {
    const nextState = !inWatchlist;
    setInWatchlist(nextState);
    if (onToggleWatchlist) onToggleWatchlist(movie.id);
    else await api.toggleWatchlist(movie.id);
  };

  const handleToggleWatched = async () => {
    const nextState = !watched;
    setWatched(nextState);
    if (onToggleWatched) onToggleWatched(movie.id);
    else await api.toggleWatched(movie.id);
  };

  const handleRate = (star: number) => {
    setRating(star);
    onRateMovie(movie.id, star);
    setWatched(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors border border-zinc-700/60 shadow-lg"
          id="close-movie-detail-btn"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable Container */}
        <div className="overflow-y-auto flex-1 scrollbar-thin">
          {/* Header Backdrop / Embedded Video Player */}
          {showEmbeddedTrailer && trailerData?.videoUrl ? (
            <div className="relative aspect-video w-full bg-black">
              <iframe
                src={trailerData.videoUrl}
                title={`${movie.title} Trailer`}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <button
                onClick={() => setShowEmbeddedTrailer(false)}
                className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-zinc-900/90 text-zinc-200 hover:text-white text-xs font-semibold border border-zinc-700 shadow-lg flex items-center gap-1.5"
              >
                <X className="w-3.5 h-3.5" /> Close Player
              </button>
            </div>
          ) : (
            <div className="relative h-64 sm:h-80 w-full bg-zinc-950">
              <img
                src={backdropUrl}
                alt={movie.title}
                className="w-full h-full object-cover opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />

              {/* Poster & Main Header Actions Overlay */}
              <div className="absolute bottom-4 left-6 right-6 flex flex-col sm:flex-row items-start sm:items-end gap-5">
                <img
                  src={posterUrl}
                  alt={movie.title}
                  className="w-28 sm:w-36 aspect-[2/3] object-cover rounded-xl border-2 border-zinc-700/80 shadow-2xl flex-none"
                />

                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-amber-400 bg-zinc-900/90 px-2.5 py-1 rounded-full border border-zinc-700 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {movie.vote_average.toFixed(1)} / 10 ({movie.vote_count || '1.2k'} votes)
                    </span>
                    <span className="text-xs text-zinc-300 bg-zinc-900/80 px-2.5 py-1 rounded-full border border-zinc-800 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-zinc-400" />
                      {movie.release_date}
                    </span>
                    {movie.runtime && (
                      <span className="text-xs text-zinc-300 bg-zinc-900/80 px-2.5 py-1 rounded-full border border-zinc-800 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {movie.runtime}m
                      </span>
                    )}
                  </div>

                  <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                    {movie.title}
                  </h2>

                  <div className="flex flex-wrap gap-1.5 text-xs text-zinc-300">
                    {genresList.map((g, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-red-950/80 text-rose-300 border border-red-800/40 font-medium">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Content Container */}
          <div className="p-6 md:p-8 space-y-8">
            
            {/* Interactive Feedback & Action Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/90 border border-zinc-800/80 shadow-lg">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Watch Trailer Button */}
                <button
                  onClick={() => {
                    if (trailerData?.videoUrl) {
                      setShowEmbeddedTrailer(true);
                    } else if (onPlayTrailer) {
                      onPlayTrailer(displayMovie);
                    }
                  }}
                  id="modal-play-trailer-btn"
                  className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-lg shadow-red-900/30 active:scale-95"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Watch Trailer
                </button>

                {/* Like Button */}
                <button
                  onClick={handleToggleLike}
                  title="Like this movie"
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    liked
                      ? 'bg-rose-950/80 border-rose-700 text-rose-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
                  <span>{liked ? 'Liked' : 'Like'}</span>
                </button>

                {/* Dislike Button */}
                <button
                  onClick={handleToggleDislike}
                  title="Dislike / Less like this"
                  className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    disliked
                      ? 'bg-amber-950/80 border-amber-700 text-amber-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <ThumbsDown className={`w-4 h-4 ${disliked ? 'fill-amber-500 text-amber-500' : ''}`} />
                  <span>{disliked ? 'Disliked' : 'Dislike'}</span>
                </button>

                {/* Watchlist Button */}
                <button
                  onClick={handleToggleWatchlist}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    inWatchlist
                      ? 'bg-emerald-950/80 border-emerald-700 text-emerald-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  }`}
                >
                  {inWatchlist ? <Check className="w-4 h-4 text-emerald-400" /> : <Bookmark className="w-4 h-4" />}
                  <span>{inWatchlist ? 'In Watchlist' : 'Watchlist'}</span>
                </button>

                {/* Watched Button */}
                <button
                  onClick={handleToggleWatched}
                  className={`px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    watched
                      ? 'bg-indigo-950/80 border-indigo-700 text-indigo-300'
                      : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                  }`}
                >
                  <Eye className={`w-4 h-4 ${watched ? 'text-indigo-400' : ''}`} />
                  <span>{watched ? 'Watched' : 'Mark Watched'}</span>
                </button>
              </div>

              {/* 5-Star Interactive Rating */}
              <div className="flex items-center gap-2 bg-zinc-950 px-3.5 py-2 rounded-xl border border-zinc-800">
                <span className="text-xs font-medium text-zinc-400">Your Rating:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRate(star)}
                      className={`p-0.5 transition-transform hover:scale-125 ${
                        (rating || 0) >= star ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-400'
                      }`}
                    >
                      <Star className={`w-4 h-4 ${(rating || 0) >= star ? 'fill-amber-400' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* "WHY THIS MOVIE?" EXPLAINABILITY BREAKDOWN SECTION */}
            {(recommendationExplanation || explanationBreakdown) && (
              <div className="p-5 rounded-2xl bg-zinc-900/90 border border-red-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Why was this movie recommended for you?
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 font-mono font-semibold">
                    Explainable AI (XAI)
                  </span>
                </div>

                <p className="text-xs text-zinc-300 leading-relaxed italic bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
                  "{recommendationExplanation || 'Matched your taste vector based on content attributes, genre preferences, and collaborative affinity.'}"
                </p>

                {explanationBreakdown && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                    <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Genre Match</span>
                      <span className="text-xs font-bold text-red-400">
                        {(explanationBreakdown.genre_match * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Story/Theme Match</span>
                      <span className="text-xs font-bold text-amber-400">
                        {(explanationBreakdown.content_match * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Vector Similarity</span>
                      <span className="text-xs font-bold text-blue-400">
                        {(explanationBreakdown.embedding_similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="p-2.5 bg-zinc-950 rounded-xl border border-zinc-800">
                      <span className="text-[10px] text-zinc-500 block">Collaborative Score</span>
                      <span className="text-xs font-bold text-emerald-400">
                        {(explanationBreakdown.collaborative_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* OTT STREAMING AVAILABILITY & DIRECT DEEP LINKS SECTION */}
            <div className="p-5 rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-950 border border-zinc-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Tv className="w-5 h-5 text-rose-500" />
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Where to Watch / Stream Online
                  </h3>
                </div>

                {/* Region Selector */}
                <div className="flex items-center gap-1 bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-800 text-xs">
                  <Globe className="w-3.5 h-3.5 text-zinc-400 mr-1" />
                  {(['IN', 'US', 'GB'] as const).map(reg => (
                    <button
                      key={reg}
                      onClick={() => handleRegionChange(reg)}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                        selectedRegion === reg
                          ? 'bg-red-600 text-white shadow'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {reg === 'IN' ? '🇮🇳 India' : reg === 'US' ? '🇺🇸 USA' : '🇬🇧 UK'}
                    </button>
                  ))}
                </div>
              </div>

              {loadingProviders ? (
                <div className="py-6 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <span>Locating verified streaming providers & deep links...</span>
                </div>
              ) : providersData && providersData.providers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {providersData.providers.map((p, idx) => (
                    <a
                      key={idx}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-3 rounded-xl bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-red-500/50 transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {p.logo ? (
                          <img
                            src={p.logo}
                            alt={p.name}
                            className="w-10 h-10 rounded-lg object-cover bg-zinc-800 shrink-0 shadow"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-xs shrink-0">
                            {p.name.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-100 group-hover:text-white truncate">
                            {p.name}
                          </p>
                          <span className={`inline-block text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded mt-0.5 ${
                            p.type === 'subscription'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40'
                              : p.type === 'free'
                              ? 'bg-blue-950/80 text-blue-400 border border-blue-800/40'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}>
                            {p.type}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-bold text-red-400 group-hover:text-red-300 shrink-0">
                        <span>Watch Now</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/60 text-xs text-zinc-400 text-center">
                  <p>Streaming availability not found for this specific region.</p>
                  {providersData?.tmdbWatchLink && (
                    <a
                      href={providersData.tmdbWatchLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-red-400 hover:underline mt-1 inline-block font-semibold"
                    >
                      View all global availability options on TMDb →
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* "MORE LIKE THIS" SIMILAR MOVIES SECTION */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-red-500" />
                  More Like This
                </h3>
                <span className="text-xs text-zinc-400">Content similarity cluster</span>
              </div>

              {loadingSimilar ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-[2/3] bg-zinc-900 animate-pulse rounded-xl" />
                  ))}
                </div>
              ) : similarMovies.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {similarMovies.map((rec, idx) => (
                    <div
                      key={rec.movie.id || idx}
                      onClick={() => {
                        if (onSelectMovie) onSelectMovie(rec.movie);
                      }}
                      className="group cursor-pointer bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl overflow-hidden p-2 flex flex-col transition-all hover:scale-105"
                    >
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-1.5">
                        <img
                          src={getImageUrl(rec.movie.poster_path, 'w500')}
                          alt={rec.movie.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">
                          {rec.confidence_score}%
                        </div>
                      </div>
                      <p className="text-[11px] font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
                        {rec.movie.title}
                      </p>
                      <span className="text-[10px] text-zinc-500">
                        {rec.movie.release_date?.substring(0, 4)} · ★ {rec.movie.vote_average?.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic">No similar titles found in local cache.</p>
              )}
            </div>

            {/* Overview Section */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
                Overview & Storyline
              </h3>
              <p className="text-sm text-zinc-200 leading-relaxed">
                {movie.overview}
              </p>
            </div>

            {/* Metadata Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 text-xs">
              <div>
                <span className="text-zinc-500 font-medium block">Director</span>
                <span className="text-zinc-200 font-semibold">{movie.director || 'N/A'}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-medium block">Runtime</span>
                <span className="text-zinc-200 font-semibold">{movie.runtime ? `${movie.runtime} mins` : 'N/A'}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-medium block">Language</span>
                <span className="text-zinc-200 font-semibold uppercase">{movie.language || 'en'}</span>
              </div>
              <div>
                <span className="text-zinc-500 font-medium block">Box Office Budget</span>
                <span className="text-zinc-200 font-semibold">
                  {movie.budget ? `$${(movie.budget / 1000000).toFixed(0)}M` : '$100M'}
                </span>
              </div>
            </div>

            {/* Featured Cast */}
            {movie.actors && movie.actors.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
                  Top Cast
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {movie.actors.map((actor, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800/80 flex items-center gap-2.5"
                    >
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-xs font-bold">
                        {actor.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200 truncate">{actor}</p>
                        <p className="text-[10px] text-zinc-500">Actor</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User Reviews & Feedback */}
            <div className="space-y-4 pt-4 border-t border-zinc-800/80">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-red-500" />
                  User Reviews ({reviews.length})
                </h3>
              </div>

              {/* Add Review Form */}
              <form onSubmit={handleAddReview} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-300">Leave a review & rating:</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setNewRating(star)}
                        className={`p-1 ${
                          newRating >= star ? 'text-amber-400' : 'text-zinc-600'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${ newRating >= star ? 'fill-amber-400' : '' }`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Share your thoughts on this film..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-red-600"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingReview || !newComment.trim()}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg flex items-center gap-1 transition-colors shadow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Post
                  </button>
                </div>
              </form>

              {/* Existing Reviews List */}
              <div className="space-y-3">
                {reviews.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic">No reviews yet. Be the first to review!</p>
                ) : (
                  reviews.map(rev => (
                    <div key={rev.id} className="p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-200">{rev.userName}</span>
                        <div className="flex items-center gap-1 text-amber-400 text-[11px] font-bold">
                          <Star className="w-3 h-3 fill-amber-400" />
                          {rev.rating} / 5
                        </div>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{rev.comment}</p>
                      <p className="text-[10px] text-zinc-500">{new Date(rev.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
