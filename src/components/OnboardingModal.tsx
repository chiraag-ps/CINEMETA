import React, { useState, useEffect } from 'react';

import {
  Film,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
  Search,
  Sliders,
  Compass,
  Star,
  Clock,
  Play,
  Calendar,
  Smile,
  Zap,
  Heart,
  X
} from 'lucide-react';

import {
  Movie,
  UserProfile,
  OnboardingPreferences
} from '../types';

import { api } from '../services/api';

interface OnboardingModalProps {
  user: UserProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (updatedUser: UserProfile) => void;
  onOpenDetails?: (movie: Movie) => void;
}

const AVAILABLE_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
  'Western'
];

const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'hi', name: 'Hindi', native: 'हिंदी' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'de', name: 'German', native: 'Deutsch' }
];

const AVAILABLE_MOODS = [
  { name: 'Thought-provoking', emoji: '🧠', desc: 'Mind-bending & philosophical' },
  { name: 'Suspenseful', emoji: '⚡', desc: 'Edge-of-your-seat thrillers' },
  { name: 'Fun', emoji: '🎉', desc: 'Lighthearted & entertaining' },
  { name: 'Emotional', emoji: '🥺', desc: 'Heartfelt & touching stories' },
  { name: 'Dark', emoji: '🌑', desc: 'Gritty & atmospheric' },
  { name: 'Inspirational', emoji: '✨', desc: 'Uplifting & motivational' },
  { name: 'Relaxing', emoji: '☕', desc: 'Calm & easy-going' }
];

const DECADE_OPTIONS = [
  { label: '2020s (Recent Releases)', value: '2020s' },
  { label: '2010s (Modern Classics)', value: '2010s' },
  { label: '2000s (Millennium Era)', value: '2000s' },
  { label: '1990s & Earlier (Classics)', value: '1990s' }
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  user,
  isOpen,
  onClose,
  onComplete
}) => {
  const [step, setStep] = useState<number>(1);
  const [catalogMovies, setCatalogMovies] = useState<Movie[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoadingMovies, setIsLoadingMovies] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Live search suggestions shown while typing in the Step 1 search box.
  const [searchSuggestions, setSearchSuggestions] = useState<Movie[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState<boolean>(false);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState<boolean>(false);

  // Track movie posters that fail to load so broken cards are removed from the picker.
  const [brokenPosterIds, setBrokenPosterIds] = useState<Set<number>>(
    () => new Set<number>()
  );

  // Step 1 State: Selected Movies (~5)
  const [selectedMovies, setSelectedMovies] = useState<Movie[]>([]);

  // Step 2 State: Favorite Genres
  const [selectedGenres, setSelectedGenres] = useState<string[]>(user?.favoriteGenres || ['Sci-Fi', 'Thriller']);

  // Step 3 State: Preferred Languages
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(user?.preferredLanguages || ['en', 'kn']);

  // Step 4 State: Movie Preferences & Moods
  const [preferredDecade, setPreferredDecade] = useState<string>('2020s');
  const [minRating, setMinRating] = useState<number>(7.0);
  const [maxRuntime, setMaxRuntime] = useState<number>(150);
  const [selectedMoods, setSelectedMoods] = useState<string[]>(['Thought-provoking', 'Suspenseful']);

  // Step 5 State: Generated Preview
  const [generatedRecs, setGeneratedRecs] = useState<any[]>([]);
  const [isGeneratingRecs, setIsGeneratingRecs] = useState<boolean>(false);

  // Media state for Step 5 preview.
  // Recommendation candidates can come from different sources, so we
  // enrich them with fresh TMDB details and trailer data before rendering.
  const [recommendationTrailers, setRecommendationTrailers] = useState<Record<number, string>>({});
  const [brokenRecommendationPosterIds, setBrokenRecommendationPosterIds] = useState<Set<number>>(
    () => new Set<number>()
  );
  const [activeTrailer, setActiveTrailer] = useState<{ title: string; url: string } | null>(null);

  // Fetch initial popular movies for Step 1
  useEffect(() => {
    if (isOpen && catalogMovies.length === 0) {
      setIsLoadingMovies(true);
      api.getPopularMovies()
        .then(movies => {
          setBrokenPosterIds(new Set());
          setCatalogMovies(
            movies.filter(movie => Boolean(movie.poster_path))
          );
          setIsLoadingMovies(false);
        })
        .catch(err => {
          console.error('Failed to load onboarding movies:', err);
          setIsLoadingMovies(false);
        });
    }
  }, [isOpen]);

  // Debounced live search for autocomplete suggestions.
  useEffect(() => {
    const query = searchQuery.trim();

    if (!isOpen || step !== 1 || query.length < 2) {
      setSearchSuggestions([]);
      setShowSearchSuggestions(false);
      setIsSearchingSuggestions(false);
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setIsSearchingSuggestions(true);

      try {
        const results = await api.searchMovies(query);

        if (cancelled) return;

        const validResults = results
          .filter(movie => Boolean(movie.poster_path))
          .slice(0, 6);

        setSearchSuggestions(validResults);
        setShowSearchSuggestions(true);
      } catch (err) {
        if (!cancelled) {
          console.error('Autocomplete search error:', err);
          setSearchSuggestions([]);
          setShowSearchSuggestions(false);
        }
      } finally {
        if (!cancelled) {
          setIsSearchingSuggestions(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, isOpen, step]);

  if (!isOpen) return null;

  const handleSuggestionSelect = (movie: Movie) => {
    setSearchQuery(movie.title);
    setCatalogMovies([movie]);
    setBrokenPosterIds(prev => {
      const next = new Set(prev);
      next.delete(movie.id);
      return next;
    });
    setSearchSuggestions([]);
    setShowSearchSuggestions(false);
  };

  const handleMovieSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setIsLoadingMovies(true);
      try {
        const pop = await api.getPopularMovies();
        setBrokenPosterIds(new Set());
        setCatalogMovies(
          pop.filter(movie => Boolean(movie.poster_path))
        );
      } catch (err) {
        console.error('Failed to load popular movies:', err);
      } finally {
        setIsLoadingMovies(false);
      }
      return;
    }
    setIsLoadingMovies(true);
    try {
      const results = await api.searchMovies(searchQuery);
      setBrokenPosterIds(new Set());
      setCatalogMovies(
        results.filter(movie => Boolean(movie.poster_path))
      );
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsLoadingMovies(false);
    }
  };

  const toggleSelectMovie = (movie: Movie) => {
    if (selectedMovies.some(m => m.id === movie.id)) {
      setSelectedMovies(selectedMovies.filter(m => m.id !== movie.id));
    } else {
      if (selectedMovies.length >= 8) {
        alert('You have selected 8 movies, which is great for cold-start initialization!');
      }
      setSelectedMovies([...selectedMovies, movie]);
    }
  };

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const toggleLanguage = (langCode: string) => {
    if (selectedLanguages.includes(langCode)) {
      if (selectedLanguages.length === 1) return; // Keep at least one
      setSelectedLanguages(selectedLanguages.filter(l => l !== langCode));
    } else {
      setSelectedLanguages([...selectedLanguages, langCode]);
    }
  };

  const toggleMood = (mood: string) => {
    if (selectedMoods.includes(mood)) {
      setSelectedMoods(selectedMoods.filter(m => m !== mood));
    } else {
      setSelectedMoods([...selectedMoods, mood]);
    }
  };

  // Step 5 Preview Generation
  const handleProceedToStep5 = async () => {
    setStep(5);
    setIsGeneratingRecs(true);
    try {
      const preferences: OnboardingPreferences = {
        preferredDecade,
        minRating,
        maxRuntime,
        moods: selectedMoods
      };

      const res = await api.generateRecommendations({
        selectedMovieIds: selectedMovies.map(m => m.id),
        selectedMovies,
        // Pass the current onboarding choices to the preview engine.
        // These values have not been saved to the user yet at Step 5.
        preferredLanguages: selectedLanguages,
        favoriteGenres: selectedGenres,
        preferences
      });

      const rawRecommendations = (res.recommendations || []).slice(0, 8);
      setBrokenRecommendationPosterIds(new Set());
      setRecommendationTrailers({});

      // Refresh media for the preview cards. This fixes cases where a
      // recommender candidate exists in the database but its cached movie
      // object is missing poster/trailer metadata.
      const enrichedRecommendations = await Promise.all(
        rawRecommendations.map(async (rec: any) => {
          let movie = rec.movie;

          try {
            const details = await api.getMovieDetails(movie.id);
            if (details) {
              movie = { ...movie, ...details };
            }
          } catch (detailsError) {
            console.warn(`Could not refresh details for movie ${movie.id}:`, detailsError);
          }

          // Some recommendation candidates come from the local catalog with
          // incomplete metadata. Search TMDB again by title when a poster is
          // still missing so the Step 5 preview can always show a real poster.
          if (!movie.poster_path) {
            try {
              const searchResults = await api.searchMovies(movie.title);
              const posterMatch = searchResults.find(result => Boolean(result.poster_path));

              if (posterMatch) {
                movie = {
                  ...movie,
                  ...posterMatch,
                  // Keep the recommendation score/explanation outside the movie object.
                  id: movie.id
                };
              }
            } catch (posterSearchError) {
              console.warn(`Could not recover poster for movie ${movie.id}:`, posterSearchError);
            }
          }

          let trailerUrl: string | null = null;

          // Prefer the trailer key already attached to the movie.
          if (movie.trailer_key) {
            trailerUrl = `https://www.youtube-nocookie.com/embed/${movie.trailer_key}?autoplay=1&rel=0&modestbranding=1`;
          }

          try {
            const trailer = await api.getMovieTrailer(movie.id);

            // The backend can return either a direct YouTube key or an
            // embed/search URL. Use videoUrl directly instead of trying to
            // parse a normal ?v= URL, because the fallback uses listType=search.
            if (trailer?.trailerKey) {
              trailerUrl = `https://www.youtube-nocookie.com/embed/${trailer.trailerKey}?autoplay=1&rel=0&modestbranding=1`;
            } else if (trailer?.videoUrl) {
              trailerUrl = trailer.videoUrl;
            }
          } catch (trailerError) {
            console.warn(`Could not load trailer for movie ${movie.id}:`, trailerError);
          }

          return {
            ...rec,
            movie,
            trailerUrl
          };
        })
      );

      const trailerMap: Record<number, string> = {};
      enrichedRecommendations.forEach((rec: any) => {
        if (rec.trailerUrl) {
          trailerMap[rec.movie.id] = rec.trailerUrl;
        }
      });

      setRecommendationTrailers(trailerMap);
      setGeneratedRecs(enrichedRecommendations);
    } catch (err) {
      console.error('Error generating preview:', err);
    } finally {
      setIsGeneratingRecs(false);
    }
  };

  const handleFinishOnboarding = async () => {
    setIsSubmitting(true);
    try {
      const preferences: OnboardingPreferences = {
        preferredDecade,
        minRating,
        maxRuntime,
        moods: selectedMoods
      };

      const res = await api.submitOnboarding({
        favoriteMovieIds: selectedMovies.map(m => m.id),
        favoriteGenres: selectedGenres,
        preferredLanguages: selectedLanguages,
        preferences,
        favoriteMovies: selectedMovies
      });

      onComplete(res.user);
      onClose();
    } catch (err: any) {
      console.error('Failed to complete onboarding:', err);
      alert(err.message || 'Failed to complete onboarding');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="px-7 pt-5 pb-4 bg-zinc-950 border-b border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="mt-0.5 w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-sm">
                <Film className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-[17px] font-semibold text-white tracking-tight">
                    Personalize your movie picks
                  </h2>
                  <span className="text-[11px] font-semibold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                    {step} of 5
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  A few quick choices and we'll tailor your recommendations.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 -mr-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
              title="Close"
              aria-label="Close onboarding"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-1.5">
            {Array.from({ length: 5 }).map((_, index) => {
              const active = index + 1 <= step;
              const current = index + 1 === step;
              return (
                <div key={index} className="flex-1 flex items-center gap-1.5">
                  <div
                    className={`h-1.5 w-full rounded-full transition-colors ${
                      active ? 'bg-red-600' : 'bg-zinc-800'
                    }`}
                  />
                  {current && (
                    <span className="sr-only">Current step {step}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content Container */}
        <div className="px-7 py-6 max-h-[70vh] overflow-y-auto">

          {/* STEP 1: FAVORITE MOVIES */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-red-500" />
                    Pick a few movies you really like
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Choose 3–5 favorites so we can understand the kind of movies you enjoy.
                  </p>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700 text-xs font-semibold text-zinc-300">
                  <span>Selected</span>
                  <span className={`px-2 py-0.5 rounded-md ${selectedMovies.length >= 3 ? 'bg-emerald-600 text-white' : 'bg-red-600/30 text-red-300'}`}>
                    {selectedMovies.length} / 5
                  </span>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative z-30">
                <form onSubmit={handleMovieSearch} className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search by title (e.g., Interstellar, Kantara, RRR, Inception, Dune)..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (e.target.value.trim().length >= 2) {
                        setShowSearchSuggestions(true);
                      } else {
                        setShowSearchSuggestions(false);
                      }
                    }}
                    onFocus={() => {
                      if (searchQuery.trim().length >= 2 && searchSuggestions.length > 0) {
                        setShowSearchSuggestions(true);
                      }
                    }}
                    onBlur={() => {
                      window.setTimeout(() => setShowSearchSuggestions(false), 150);
                    }}
                    autoComplete="off"
                    className="w-full pl-10 pr-24 py-2.5 bg-zinc-950 border border-zinc-700 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 rounded-lg transition-colors"
                  >
                    Search
                  </button>
                </form>

                {showSearchSuggestions && searchQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl overflow-hidden">
                    {isSearchingSuggestions ? (
                      <div className="px-4 py-3 text-xs text-zinc-400 flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                        Searching movies...
                      </div>
                    ) : searchSuggestions.length > 0 ? (
                      <div className="py-1">
                        {searchSuggestions.map(movie => (
                          <button
                            key={movie.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSuggestionSelect(movie);
                            }}
                            className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-zinc-800 transition-colors"
                          >
                            <img
                              src={
                                movie.poster_path!.startsWith('http')
                                  ? movie.poster_path!
                                  : `https://image.tmdb.org/t/p/w92${movie.poster_path}`
                              }
                              alt={movie.title}
                              className="w-8 h-12 rounded object-cover bg-zinc-800 flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white truncate">{movie.title}</p>
                              <p className="text-[11px] text-zinc-500">
                                {movie.release_date?.substring(0, 4) || 'Release year unavailable'}
                                {movie.vote_average ? ` · ★ ${movie.vote_average.toFixed(1)}` : ''}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-xs text-zinc-500">
                        No matching movies found.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Movie Grid */}
              {isLoadingMovies ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 py-8">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="aspect-[2/3] bg-zinc-800/50 animate-pulse rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {catalogMovies.filter(movie => !brokenPosterIds.has(movie.id)).length === 0 ? (
                    <div className="col-span-full py-10 text-center">
                      <p className="text-sm text-zinc-400">
                        No movies with valid posters were found.
                      </p>
                      <p className="text-xs text-zinc-600 mt-1">
                        Try searching for another movie.
                      </p>
                    </div>
                  ) : (
                    catalogMovies
                      .filter(movie => !brokenPosterIds.has(movie.id))
                      .slice(0, 15)
                      .map(movie => {
                    const isSelected = selectedMovies.some(m => m.id === movie.id);
                    return (
                      <div
                        key={movie.id}
                        onClick={() => toggleSelectMovie(movie)}
                        className={`group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200 ${
                          isSelected
                            ? 'border-red-500 ring-2 ring-red-500/30 scale-[0.98]'
                            : 'border-transparent hover:border-zinc-700 hover:scale-[1.02]'
                        }`}
                      >
                        <img
                          src={
                            movie.poster_path.startsWith('http')
                              ? movie.poster_path
                              : `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                          }
                          alt={movie.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={() => {
                            setBrokenPosterIds(prev => {
                              const next = new Set(prev);
                              next.add(movie.id);
                              return next;
                            });
                          }}
                        />
                        
                        {/* Overlay */}
                        <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent p-2.5 flex flex-col justify-between transition-opacity ${
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}>
                          <div className="flex justify-end">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              isSelected ? 'bg-red-600 text-white shadow-md' : 'bg-black/60 text-zinc-300'
                            }`}>
                              {isSelected ? <Check className="w-3.5 h-3.5" /> : '+'}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white line-clamp-1">{movie.title}</p>
                            <p className="text-[10px] text-zinc-300">
                              {movie.release_date?.substring(0, 4)} · ★ {movie.vote_average?.toFixed(1)}
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-bold uppercase tracking-wider rounded">
                            Seed
                          </div>
                        )}
                      </div>
                    );
                  })
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: FAVORITE GENRES */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-red-400 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    <Compass className="w-3.5 h-3.5" />
                    Your taste
                  </div>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    What do you usually enjoy?
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1 max-w-xl">
                    Pick the genres you naturally reach for. Choose at least 2.
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[11px] text-zinc-500">Selected</div>
                  <div className="text-sm font-semibold text-white mt-0.5">
                    {selectedGenres.length} genres
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {AVAILABLE_GENRES.map(genre => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleGenre(genre)}
                      className={`min-h-[50px] px-4 rounded-lg border text-left flex items-center justify-between transition-all duration-150 ${
                        isSelected
                          ? 'bg-white border-white text-zinc-950 shadow-sm'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900'
                      }`}
                    >
                      <span className="text-sm font-medium">{genre}</span>
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          isSelected
                            ? 'bg-zinc-950 text-white'
                            : 'border border-zinc-700 text-zinc-600'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: PREFERRED LANGUAGES */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-red-400 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    <Film className="w-3.5 h-3.5" />
                    What you watch
                  </div>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    Which languages should we include?
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1 max-w-xl">
                    We'll keep recommendations within the languages you select.
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[11px] text-zinc-500">Selected</div>
                  <div className="text-sm font-semibold text-white mt-0.5">
                    {selectedLanguages.length} {selectedLanguages.length === 1 ? 'language' : 'languages'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {AVAILABLE_LANGUAGES.map(lang => {
                  const isSelected = selectedLanguages.includes(lang.code);
                  return (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleLanguage(lang.code)}
                      className={`min-h-[64px] px-4 rounded-lg border text-left flex items-center justify-between transition-all duration-150 ${
                        isSelected
                          ? 'bg-white border-white text-zinc-950 shadow-sm'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold">{lang.name}</p>
                        <p className={`text-xs mt-0.5 ${isSelected ? 'text-zinc-600' : 'text-zinc-500'}`}>{lang.native}</p>
                      </div>
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          isSelected ? 'bg-zinc-950 text-white' : 'border border-zinc-700 text-zinc-600'
                        }`}
                      >
                        {isSelected ? <Check className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: MOVIE PREFERENCES & MOOD */}
          {step === 4 && (
            <div className="space-y-7">
              <div>
                <div className="flex items-center gap-2 text-red-400 text-[11px] font-semibold uppercase tracking-[0.16em]">
                  <Heart className="w-3.5 h-3.5" />
                  One last thing
                </div>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                  How do you like to watch?
                </h3>
                <p className="text-sm text-zinc-400 mt-1 max-w-xl">
                  Tell us the mood, era and pace that usually make a movie worth your time.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Your go-to mood</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Pick as many as you like.</p>
                  </div>
                  <span className="text-xs text-zinc-500">{selectedMoods.length} selected</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_MOODS.map(m => {
                    const isSelected = selectedMoods.includes(m.name);
                    return (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => toggleMood(m.name)}
                        title={m.desc}
                        className={`px-3.5 py-2 rounded-full border text-sm font-medium transition-all duration-150 ${
                          isSelected
                            ? 'bg-white border-white text-zinc-950'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{m.emoji}</span>
                          {m.name}
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    Preferred era
                  </div>
                  <select
                    value={preferredDecade}
                    onChange={(e) => setPreferredDecade(e.target.value)}
                    className="mt-3 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-600"
                  >
                    {DECADE_OPTIONS.map(d => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Star className="w-4 h-4 text-zinc-400" />
                      Minimum rating
                    </div>
                    <span className="text-sm font-semibold text-white">{minRating.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="5.0"
                    max="8.5"
                    step="0.5"
                    value={minRating}
                    onChange={(e) => setMinRating(parseFloat(e.target.value))}
                    className="mt-4 w-full accent-red-600"
                  />
                  <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
                    <span>5.0</span>
                    <span>8.5</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Clock className="w-4 h-4 text-zinc-400" />
                      Movie length
                    </div>
                    <span className="text-sm font-semibold text-white">{maxRuntime} min</span>
                  </div>
                  <input
                    type="range"
                    min="90"
                    max="180"
                    step="15"
                    value={maxRuntime}
                    onChange={(e) => setMaxRuntime(parseInt(e.target.value))}
                    className="mt-4 w-full accent-red-600"
                  />
                  <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
                    <span>90 min</span>
                    <span>180 min</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: GENERATE & PREVIEW RECOMMENDATIONS */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-red-400 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    <Sparkles className="w-3.5 h-3.5" />
                    Your picks
                  </div>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                    A few movies to get you started
                  </h3>
                  <p className="text-sm text-zinc-400 mt-1">
                    Based on the movies, genres and languages you chose.
                  </p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-400">
                  <span>{selectedMovies.length} movies</span>
                  <span className="text-zinc-700">•</span>
                  <span>{selectedGenres.length} genres</span>
                  <span className="text-zinc-700">•</span>
                  <span>{selectedLanguages.length} {selectedLanguages.length === 1 ? 'language' : 'languages'}</span>
                </div>
              </div>

              {isGeneratingRecs ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-zinc-400">Computing TF-IDF, embeddings & MMR diversity ranker...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-white">
                      Your first recommendations
                    </h4>
                    <span className="text-xs text-zinc-500">Tap Trailer to watch a preview</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {generatedRecs.slice(0, 4).map((rec, idx) => {
                      const posterPath = rec.movie.poster_path || rec.movie.backdrop_path;
                      const posterUrl = posterPath
                        ? (posterPath.startsWith('http')
                            ? posterPath
                            : `https://image.tmdb.org/t/p/w500${posterPath}`)
                        : null;
                      const trailerUrl = recommendationTrailers[rec.movie.id];

                      return (
                        <div
                          key={rec.movie.id || idx}
                          className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden p-2.5 flex flex-col transition-colors hover:border-zinc-700"
                        >
                          <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden mb-2 bg-zinc-900">
                            {posterUrl && !brokenRecommendationPosterIds.has(rec.movie.id) ? (
                              <img
                                src={posterUrl}
                                alt={rec.movie.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={() => {
                                  setBrokenRecommendationPosterIds(prev => {
                                    const next = new Set(prev);
                                    next.add(rec.movie.id);
                                    return next;
                                  });
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-500 text-xs px-3 text-center">
                                Poster unavailable
                              </div>
                            )}

                            {trailerUrl && (
                              <button
                                type="button"
                                onClick={() => setActiveTrailer({ title: rec.movie.title, url: trailerUrl })}
                                className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-600/95 hover:bg-red-500 text-white text-[10px] font-bold shadow-lg transition-colors"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                Trailer
                              </button>
                            )}
                          </div>

                          <p className="text-xs font-bold text-white line-clamp-1">{rec.movie.title}</p>
                          <div className="flex items-center justify-between mt-1 text-[10px]">
                            <span className="text-emerald-400 font-bold">{rec.confidence_score}% Match</span>
                            <span className="text-zinc-400">★ {rec.movie.vote_average?.toFixed(1)}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400 line-clamp-2 mt-1 italic">
                            {rec.explanation}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {activeTrailer && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <div className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                <div className="text-sm font-bold text-white truncate pr-4">
                  {activeTrailer.title} — Trailer
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTrailer(null)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
                  aria-label="Close trailer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="aspect-video bg-black">
                <iframe
                  src={activeTrailer.url}
                  title={`${activeTrailer.title} trailer`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation Bar */}
        <div className="flex items-center justify-between px-7 py-4 border-t border-zinc-800 bg-zinc-950">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-medium px-2"
            >
              Skip for now
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : step === 4 ? (
              <button
                type="button"
                onClick={handleProceedToStep5}
                className="px-5 py-2.5 bg-white hover:bg-zinc-200 text-zinc-950 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                Show My Picks
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleFinishOnboarding}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving Profile...' : 'Save & Start Exploring'}
                <Check className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};