import React, { useEffect, useState } from 'react';
import {
  Search,
  Film,
  Bookmark,
  User,
  Compass,
  Bot,
  Sliders,
} from 'lucide-react';
import { Movie, UserProfile } from '../types';
import { api } from '../services/api';
import { getImageUrl } from '../data/mockMovies';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  user: UserProfile | null;
  onOpenAuthModal: () => void;
  onOpenMovieModal: (movie: Movie) => void;
  onOpenOnboarding?: () => void;
  onOpenAiAssistant?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  user,
  onOpenAuthModal,
  onOpenMovieModal,
  onOpenOnboarding,
  onOpenAiAssistant,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

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
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const navButtonClass = (active: boolean) =>
    `px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
      active
        ? 'bg-zinc-800 text-white'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">

        {/* Brand */}
        <button
          onClick={() => setCurrentView('home')}
          className="group flex shrink-0 items-center gap-2.5 text-left focus:outline-none"
          id="brand-logo-btn"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white transition-transform duration-200 group-hover:scale-105">
            <Film className="h-5 w-5" />
          </div>

          <div className="leading-none">
            <span className="text-xl font-bold tracking-[0.08em] text-zinc-100">
              CINEMETA
            </span>
            <span className="mt-1 block text-[9px] uppercase tracking-[0.2em] text-zinc-500">
              Find something worth watching
            </span>
          </div>
        </button>

        {/* Navigation */}
        <nav className="hidden items-center gap-1 lg:flex">
          <button
            onClick={() => setCurrentView('home')}
            id="nav-home-btn"
            className={navButtonClass(currentView === 'home')}
          >
            <Compass className="h-4 w-4 text-red-400" />
            Explore
          </button>

          <button
            onClick={() => setCurrentView('recommendations')}
            id="nav-recommendations-btn"
            className={navButtonClass(currentView === 'recommendations')}
          >
            <span className="text-sm">✦</span>
            Discover
          </button>

          <button
            onClick={() => setCurrentView('watchlist')}
            id="nav-watchlist-btn"
            className={navButtonClass(currentView === 'watchlist')}
          >
            <Bookmark className="h-4 w-4 text-emerald-400" />
            My List
            {user?.watchlistMovieIds?.length ? (
              <span className="text-[11px] text-zinc-500">
                {user.watchlistMovieIds.length}
              </span>
            ) : null}
          </button>
        </nav>

        {/* Search + actions */}
        <div className="flex min-w-0 items-center gap-2">
          {onOpenAiAssistant && (
            <button
              onClick={onOpenAiAssistant}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white sm:flex"
              title="Ask CINEMETA"
            >
              <Bot className="h-4 w-4 text-red-400" />
              Ask CINEMETA
            </button>
          )}

          {onOpenOnboarding && (
            <button
              onClick={onOpenOnboarding}
              className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white xl:flex"
              title="Tune your movie picks"
            >
              <Sliders className="h-3.5 w-3.5" />
              Tune my picks
            </button>
          )}

          <div className="relative hidden w-44 sm:block md:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />

            <input
              type="text"
              placeholder="Find a movie..."
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900/80 py-2 pl-9 pr-3 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-700 focus:bg-zinc-900"
              id="movie-search-input"
            />

            {showSearchDropdown && searchQuery.trim() && (
              <div className="absolute right-0 top-full mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
                {isSearching ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    Finding movies...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-500">
                    Nothing matched “{searchQuery}”
                  </div>
                ) : (
                  <div className="p-2">
                    <div className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                      Search results
                    </div>

                    {searchResults.slice(0, 6).map((movie) => (
                      <button
                        key={movie.id}
                        onClick={() => {
                          onOpenMovieModal(movie);
                          setShowSearchDropdown(false);
                          setSearchQuery('');
                        }}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-zinc-800"
                      >
                        <img
                          src={getImageUrl(movie.poster_path, 'w500')}
                          alt={movie.title}
                          className="h-14 w-10 rounded object-cover"
                        />

                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-medium text-zinc-100">
                            {movie.title}
                          </h4>
                          <p className="mt-0.5 truncate text-xs text-zinc-500">
                            {movie.release_date?.substring(0, 4) || '—'}
                            {movie.director ? ` • ${movie.director}` : ''}
                          </p>
                          <p className="mt-1 text-[11px] text-amber-400">
                            ★ {movie.vote_average.toFixed(1)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {user ? (
            <button
              onClick={() => setCurrentView('profile')}
              id="user-profile-btn"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-900"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>

              <span className="hidden max-w-[100px] truncate text-sm text-zinc-300 md:block">
                {user.name}
              </span>

              <User className="hidden h-3.5 w-3.5 text-zinc-600 lg:block" />
            </button>
          ) : (
            <button
              onClick={onOpenAuthModal}
              id="login-register-btn"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
