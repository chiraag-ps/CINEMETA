import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Cpu,
  Layers,
  CheckCircle,
  RefreshCw,
  Star,
  Info,
  ArrowRight,
  Download,
  Share2,
  Filter,
  Search,
  X,
  Plus,
  Film,
  Sliders,
  Compass,
  Zap
} from 'lucide-react';
import { Movie, RecommendationResult, UserProfile } from '../types';
import { api } from '../services/api';
import { MovieCard } from './MovieCard';
import { getImageUrl } from '../data/mockMovies';
import { ColdStartStageDemo } from './ColdStartStageDemo';

interface ColdStartWizardProps {
  user: UserProfile | null;
  allMovies: Movie[];
  onOpenDetails: (movie: Movie) => void;
  onPlayTrailer: (movie: Movie) => void;
  onToggleWatchlist: (movieId: number) => void;
  onRateMovie: (movieId: number, rating: number) => void;
  onOpenOnboarding?: () => void;
}

export const ColdStartWizard: React.FC<ColdStartWizardProps> = ({
  user,
  allMovies,
  onOpenDetails,
  onPlayTrailer,
  onToggleWatchlist,
  onRateMovie,
  onOpenOnboarding
}) => {
  // Map of selected movies to retain full metadata even for searched items
  const [selectedMoviesMap, setSelectedMoviesMap] = useState<Map<number, Movie>>(() => new Map<number, Movie>());
  const [recommendations, setRecommendations] = useState<RecommendationResult[]>([]);
  const [algorithmUsed, setAlgorithmUsed] = useState<string>('unified_hybrid');
  const [interactionCount, setInteractionCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  // Advanced Tuning Controls
  const [diversityLambda, setDiversityLambda] = useState<number>(0.75);
  const [showSimulator, setShowSimulator] = useState<boolean>(false);
  const [nlpQuery, setNlpQuery] = useState<string>('');

  // Global Dataset Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Initialize selected movies map with default/liked movies
  useEffect(() => {
    const map = new Map<number, Movie>();

    const userHistoryIds = user ? Array.from(new Set([
      ...(user.likedMovieIds || []),
      ...(user.watchlistMovieIds || []),
      ...Object.keys(user.ratings || {}).map(Number)
    ])) : [];

    if (userHistoryIds.length > 0) {
      userHistoryIds.forEach(id => {
        const found = allMovies.find(m => m.id === id);
        if (found) map.set(id, found);
      });
    }

    // Only fallback to initial cold-start default picks if user has zero watch/interaction history
    if (map.size === 0 && (!user || (user.likedMovieIds?.length === 0 && user.watchlistMovieIds?.length === 0 && Object.keys(user.ratings || {}).length === 0))) {
      const defaultPicks = [157336, 27205, 155];
      defaultPicks.forEach(id => {
        const found = allMovies.find(m => m.id === id);
        if (found) map.set(id, found);
      });
    }

    setSelectedMoviesMap(map);
  }, [user, allMovies]);

  // Live TMDb Global Search Debounce Effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await api.searchMovies(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Seed search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectedMovieIds: number[] = Array.from(selectedMoviesMap.keys());
  const selectedMoviesList: Movie[] = Array.from(selectedMoviesMap.values());

  const handleToggleSelectMovie = (movie: Movie) => {
    const newMap = new Map(selectedMoviesMap);
    if (newMap.has(movie.id)) {
      newMap.delete(movie.id);
    } else {
      if (newMap.size >= 12) return; // Limit to 12 seed films
      newMap.set(movie.id, movie);
    }
    setSelectedMoviesMap(newMap);
  };

  const handleRunRecommendation = async () => {
    setIsLoading(true);
    try {
      if (nlpQuery.trim()) {
        const res = await api.nlpSearch(nlpQuery, diversityLambda);
        setRecommendations(res.recommendations);
        setAlgorithmUsed('nlp_semantic_hybrid');
      } else {
        const res = await api.generateRecommendations({
          selectedMovieIds,
          selectedMovies: selectedMoviesList,
          diversityLambda
        });
        setRecommendations(res.recommendations);
        setAlgorithmUsed(res.algorithmUsed);
        setInteractionCount(res.interactionCount);
      }
    } catch (err) {
      console.error('Recommendation generation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine list of seed candidate movies to show
  const displaySeedCandidates = searchQuery.trim().length > 0
    ? searchResults
    : allMovies;

  const exportHistoryJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(recommendations, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `cinemeta_recommendations_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="relative rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-950 to-red-950/40 p-6 md:p-8 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-black tracking-wider bg-red-600 text-white uppercase shadow-md flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                RECOMMENDED FOR YOU
              </span>
              <span className="text-xs text-zinc-400 font-mono bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                Algorithm: {algorithmUsed}
              </span>
              <span className="text-xs text-zinc-400 font-mono bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800">
                Active Seeds: {selectedMovieIds.length}
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              AI Recommendation
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Real-time meta-learning hybrid recommendation model combining TF-IDF content similarity, SVD collaborative vectors, and Maximum Marginal Relevance (MMR) diversity optimization.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onOpenOnboarding && (
              <button
                onClick={onOpenOnboarding}
                className="px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-rose-300 text-xs font-bold flex items-center gap-2 transition-all shadow"
              >
                <Sliders className="w-4 h-4 text-red-400" />
                Cold-Start Wizard
              </button>
            )}

            <button
              onClick={() => setShowSimulator(!showSimulator)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                showSimulator
                  ? 'bg-amber-600 text-white border-amber-500 shadow-lg shadow-amber-900/30'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
              }`}
            >
              <Cpu className="w-4 h-4 text-amber-400" />
              {showSimulator ? 'Hide Simulator' : 'Simulate Cold-Start Stages'}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Cold-Start Stage Progression Simulator */}
      {showSimulator && (
        <ColdStartStageDemo onSelectMovie={onOpenDetails} />
      )}

      {/* Diversity & Natural Language Query Control Strip */}
      <div className="p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-lg space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          
          {/* Natural Language Prompt Query Input */}
          <div className="md:col-span-7 space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-rose-500" />
              Natural Language Intent Query (Optional)
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. 'Mind-bending sci-fi with dark psychological themes' or 'Relaxing comedy'"
                value={nlpQuery}
                onChange={e => setNlpQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl px-3 py-2.5 text-zinc-200 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/50 transition-all placeholder:text-zinc-500"
              />
              {nlpQuery && (
                <button
                  onClick={() => {
                    setNlpQuery('');
                    handleRunRecommendation();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* MMR Diversity Lambda Slider */}
          <div className="md:col-span-5 space-y-1.5 bg-zinc-950 p-3 rounded-xl border border-zinc-800/80">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-zinc-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                MMR Diversity (Î» = {diversityLambda.toFixed(2)})
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {diversityLambda > 0.8 ? 'Max Relevance' : diversityLambda < 0.4 ? 'High Serendipity' : 'Balanced'}
              </span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={diversityLambda}
              onChange={e => setDiversityLambda(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-600"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>Novelty & Exploration</span>
              <span>Exact Content Match</span>
            </div>
          </div>

        </div>
      </div>

      {/* Main Grid: Left = Global Dataset Movie Search & Seed Picker, Right = Recommendations Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Movie Search & Picker */}
        <div className="lg:col-span-5 space-y-4 bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-rose-500" />
                Select Seed Movies ({selectedMovieIds.length}/12)
              </h2>
              <p className="text-xs text-zinc-400">Search any film in global database to add</p>
            </div>
            {selectedMovieIds.length > 0 && (
              <button
                onClick={() => setSelectedMoviesMap(new Map())}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                Clear All
              </button>
            )}
          </div>

          {/* Live Global Dataset Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ANY film in global dataset (e.g. Avatar, Dune, Parasite, Kantara...)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs rounded-xl pl-9 pr-8 py-2.5 text-zinc-200 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/50 transition-all placeholder:text-zinc-500"
              id="seed-movie-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Search Status / Category Indicator */}
          <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
            {isSearching ? (
              <span className="flex items-center gap-1.5 text-red-400 font-semibold">
                <RefreshCw className="w-3 h-3 animate-spin" /> Searching TMDb global database...
              </span>
            ) : searchQuery.trim() ? (
              <span>Found {searchResults.length} films matching "{searchQuery}"</span>
            ) : (
              <span>Popular Seed Suggestions ({allMovies.length} available)</span>
            )}
          </div>

          {/* Scrollable Library & Search Results List */}
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
            {displaySeedCandidates.length === 0 && !isSearching ? (
              <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/40">
                No films found for "{searchQuery}". Try another movie name or director.
              </div>
            ) : (
              displaySeedCandidates.map(movie => {
                const isSelected = selectedMoviesMap.has(movie.id);
                const posterUrl = getImageUrl(movie.poster_path, 'w500');

                return (
                  <div
                    key={movie.id}
                    onClick={() => handleToggleSelectMovie(movie)}
                    className={`flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-red-950/60 border-red-700/80 shadow-md'
                        : 'bg-zinc-950/60 hover:bg-zinc-900 border-zinc-800/60'
                    }`}
                  >
                    <img
                      src={posterUrl}
                      alt={movie.title}
                      className="w-10 h-14 object-cover rounded-lg shadow-sm"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-zinc-100 truncate">{movie.title}</h4>
                      <p className="text-[10px] text-zinc-400 truncate">
                        {movie.release_date?.substring(0, 4)} â€¢ {Array.isArray(movie.genres) ? movie.genres.slice(0, 2).map(g => typeof g === 'string' ? g : g.name).join(', ') : ''}
                      </p>
                      <span className="text-[10px] text-amber-400 font-bold">
                        â˜… {movie.vote_average ? movie.vote_average.toFixed(1) : '7.5'}
                      </span>
                    </div>

                    <button
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 ${
                        isSelected
                          ? 'bg-red-600 text-white'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> Selected
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" /> Add
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Active Seed Profile Badges */}
          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300">Active Seed Profile ({selectedMoviesList.length} selected):</span>
            </div>

            {selectedMoviesList.length === 0 ? (
              <p className="text-[11px] text-zinc-500 italic">No seed movies selected. Search or pick films above.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                {selectedMoviesList.map(m => (
                  <span
                    key={m.id}
                    className="inline-flex items-center gap-1.5 text-xs bg-zinc-950 border border-zinc-800 text-zinc-200 pl-2 pr-1.5 py-1 rounded-full shadow-sm"
                  >
                    <span className="max-w-[130px] truncate font-medium">{m.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelectMovie(m);
                      }}
                      className="text-zinc-500 hover:text-white font-bold text-xs bg-zinc-900 rounded-full w-4 h-4 flex items-center justify-center"
                    >
                      Ã—
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Recommendations Action & Output */}
        <div className="lg:col-span-7 space-y-6">
          {/* Recommendation Action Card */}
          <div className="bg-zinc-900/80 border border-zinc-800 p-6 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-red-500" />
                  Recommended for You
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Get personalized movie recommendations automatically tailored to your seeds and watch history.
                </p>
              </div>

              <button
                onClick={handleRunRecommendation}
                disabled={isLoading}
                id="generate-recommendations-btn"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-xl shadow-red-950/50 transition-all hover:scale-105 disabled:opacity-50 shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Finding Your Best Matches...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Recommended for You
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Recommendations Header & Actions */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Top Recommendations ({recommendations.length})
            </h3>

            <button
              onClick={exportHistoryJSON}
              className="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
          </div>

          {/* Recommendations Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-12">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <div key={n} className="aspect-[2/3] rounded-xl bg-zinc-900 animate-pulse border border-zinc-800" />
              ))}
            </div>
          ) : recommendations.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500 bg-zinc-900/40 rounded-2xl border border-zinc-800/50">
              No recommendations generated yet. Select seed movies and click "Recommended for You".
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {recommendations.map(res => (
                <MovieCard
                  key={res.movie.id}
                  movie={res.movie}
                  recommendationDetails={res}
                  isInWatchlist={user?.watchlistMovieIds?.includes(res.movie.id)}
                  userRating={user?.ratings ? user.ratings[res.movie.id] : undefined}
                  onOpenDetails={onOpenDetails}
                  onPlayTrailer={onPlayTrailer}
                  onToggleWatchlist={onToggleWatchlist}
                  onRateMovie={onRateMovie}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

