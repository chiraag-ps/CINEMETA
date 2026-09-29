import React, { useEffect, useState } from 'react';
import { Movie, RecommendationResult, UserProfile } from '../types';
import { HeroBanner } from '../components/HeroBanner';
import { MovieRow } from '../components/MovieRow';
import { api } from '../services/api';

interface HomePageProps {
  user: UserProfile | null;
  allMovies: Movie[];
  onOpenDetails: (movie: Movie) => void;
  onPlayTrailer: (movie: Movie) => void;
  onToggleWatchlist: (movieId: number) => void;
  onRateMovie: (movieId: number, rating: number) => void;
  onNavigateToRecommendations: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  user,
  allMovies,
  onOpenDetails,
  onPlayTrailer,
  onToggleWatchlist,
  onRateMovie,
  onNavigateToRecommendations,
}) => {
  const [aiRecommendations, setAiRecommendations] = useState<RecommendationResult[]>([]);
  const [recommendationMap, setRecommendationMap] =
    useState<Map<number, RecommendationResult>>(new Map());
  const [popularMovies, setPopularMovies] = useState<Movie[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<Movie[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<Movie[]>([]);

  useEffect(() => {
    api
      .getPopularMovies()
      .then((movies) => setPopularMovies(movies))
      .catch((error) => console.error('Popular movies error:', error));

    api
      .getTopRatedMovies()
      .then((movies) => setTopRatedMovies(movies))
      .catch((error) => console.error('Top rated movies error:', error));

    api
      .getTrendingMovies()
      .then((movies) => setTrendingMovies(movies))
      .catch((error) => console.error('Trending movies error:', error));
  }, []);

  const heroMovie = allMovies[0] || popularMovies[0];

  const watchlistIds = user?.watchlistMovieIds || [];
  const userRatings = user?.ratings || {};

  const sciFiMovies = allMovies.filter(
    (movie) =>
      Array.isArray(movie.genres) &&
      movie.genres.some(
        (genre) =>
          (typeof genre === 'string' ? genre : genre.name) ===
          'Science Fiction'
      )
  );

  const crimeDramaMovies = allMovies.filter(
    (movie) =>
      Array.isArray(movie.genres) &&
      movie.genres.some((genre) =>
        ['Crime', 'Drama'].includes(
          typeof genre === 'string' ? genre : genre.name
        )
      )
  );

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-5 sm:px-6 lg:px-8">
      {heroMovie && (
        <HeroBanner
          movie={heroMovie}
          isInWatchlist={watchlistIds.includes(heroMovie.id)}
          userRating={userRatings[heroMovie.id]}
          onOpenDetails={onOpenDetails}
          onPlayTrailer={onPlayTrailer}
          onToggleWatchlist={onToggleWatchlist}
          onRateMovie={onRateMovie}
        />
      )}

      {aiRecommendations.length > 0 && (
        <MovieRow
          title="Picked for You"
          subtitle="A few movies that fit your taste"
          isAiRecommended={true}
          movies={aiRecommendations.map((item) => item.movie)}
          recommendationMap={recommendationMap}
          watchlistIds={watchlistIds}
          userRatings={userRatings}
          onOpenDetails={onOpenDetails}
          onPlayTrailer={onPlayTrailer}
          onToggleWatchlist={onToggleWatchlist}
          onRateMovie={onRateMovie}
        />
      )}

      <MovieRow
        title="Trending right now"
        subtitle="What people are watching this week"
        movies={trendingMovies.length > 0 ? trendingMovies : allMovies}
        watchlistIds={watchlistIds}
        userRatings={userRatings}
        onOpenDetails={onOpenDetails}
        onPlayTrailer={onPlayTrailer}
        onToggleWatchlist={onToggleWatchlist}
        onRateMovie={onRateMovie}
      />

      <MovieRow
        title="Highly rated"
        subtitle="A collection of audience favourites"
        movies={topRatedMovies.length > 0 ? topRatedMovies : allMovies}
        watchlistIds={watchlistIds}
        userRatings={userRatings}
        onOpenDetails={onOpenDetails}
        onPlayTrailer={onPlayTrailer}
        onToggleWatchlist={onToggleWatchlist}
        onRateMovie={onRateMovie}
      />

      <MovieRow
        title="In the mood for sci-fi & action"
        subtitle="Big ideas, strange worlds and plenty of adventure"
        movies={sciFiMovies.length > 0 ? sciFiMovies : allMovies}
        watchlistIds={watchlistIds}
        userRatings={userRatings}
        onOpenDetails={onOpenDetails}
        onPlayTrailer={onPlayTrailer}
        onToggleWatchlist={onToggleWatchlist}
        onRateMovie={onRateMovie}
      />

      <MovieRow
        title="Crime, drama & great stories"
        subtitle="Character-driven movies for a slower night in"
        movies={crimeDramaMovies.length > 0 ? crimeDramaMovies : allMovies}
        watchlistIds={watchlistIds}
        userRatings={userRatings}
        onOpenDetails={onOpenDetails}
        onPlayTrailer={onPlayTrailer}
        onToggleWatchlist={onToggleWatchlist}
        onRateMovie={onRateMovie}
      />

      <div className="flex justify-center pt-1">
        <button
          onClick={onNavigateToRecommendations}
          className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
        >
          Explore more picks
        </button>
      </div>
    </div>
  );
};
