/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Movie, UserProfile } from './types';
import { api } from './services/api';

import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { ColdStartWizard } from './components/ColdStartWizard';
import { WatchlistPage } from './pages/WatchlistPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';

import { MovieDetailModal } from './components/MovieDetailModal';
import { TrailerModal } from './components/TrailerModal';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { AiAssistantModal } from './components/AiAssistantModal';
import { Bot } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState<
    'home' | 'recommendations' | 'watchlist' | 'profile' | 'admin'
  >('home');

  const [user, setUser] = useState<UserProfile | null>(null);
  const [allMovies, setAllMovies] = useState<Movie[]>([]);

  // Session state
  const [sessionChecked, setSessionChecked] = useState(false);

  // Modals
  const [selectedMovieModal, setSelectedMovieModal] =
    useState<Movie | null>(null);

  const [trailerModalMovie, setTrailerModalMovie] =
    useState<Movie | null>(null);

  const [isAuthModalOpen, setIsAuthModalOpen] =
    useState(false);

  const [isOnboardingModalOpen, setIsOnboardingModalOpen] =
    useState(false);

  const [isAiAssistantOpen, setIsAiAssistantOpen] =
    useState(false);

  /*
   * ---------------------------------------------------------
   * CHECK LOGIN SESSION
   * ---------------------------------------------------------
   *
   * Important:
   * We do NOT call /api/auth/me when there is no token.
   *
   * Previously, the backend returned the demo user when no
   * token existed. That caused the Cold-Start Wizard to open
   * before the login screen.
   */

  useEffect(() => {
    const token = localStorage.getItem('cinemeta_token');

    // No login token -> show authentication first
    if (!token) {
      setUser(null);
      setSessionChecked(true);
      return;
    }

    // Token exists -> validate it
    api.getMe()
      .then((res) => {
        if (!res.user || res.isGuest) {
          throw new Error('Invalid authenticated session');
        }

        setUser(res.user);

        /*
         * New authenticated user:
         * show onboarding only AFTER login.
         */
        if (
          res.user.interactionCount === 0 &&
          (!res.user.favoriteGenres ||
            res.user.favoriteGenres.length === 0)
        ) {
          const onboardingDone = localStorage.getItem(
            `cinemeta_onboarded_${res.user.id}`
          );

          if (!onboardingDone) {
            setIsOnboardingModalOpen(true);
          }
        }
      })
      .catch((error) => {
        console.error('Session validation failed:', error);

        // Remove invalid token
        localStorage.removeItem('cinemeta_token');

        setUser(null);
      })
      .finally(() => {
        setSessionChecked(true);
      });
  }, []);

  /*
   * ---------------------------------------------------------
   * LOAD MOVIES ONLY AFTER AUTHENTICATION
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!user) return;

    api.getPopularMovies()
      .then((movies) => {
        setAllMovies(movies);
      })
      .catch((err) => {
        console.error('Movies fetch error:', err);
      });
  }, [user?.id]);

  /*
   * ---------------------------------------------------------
   * USER INTERACTIONS
   * ---------------------------------------------------------
   */

  const handleRateMovie = async (
    movieId: number,
    rating: number
  ) => {
    try {
      const updatedUser = await api.rateMovie(
        movieId,
        rating
      );

      setUser(updatedUser);
    } catch (err) {
      console.error('Rate error:', err);
    }
  };

  const handleToggleWatchlist = async (movieId: number) => {
    try {
      const res = await api.toggleWatchlist(movieId);

      setUser(res.user);
    } catch (err) {
      console.error('Watchlist toggle error:', err);
    }
  };

  const handleToggleLike = async (movieId: number) => {
    try {
      const res = await api.toggleLike(movieId);

      setUser(res.user);
    } catch (err) {
      console.error('Like toggle error:', err);
    }
  };

  const handleToggleDislike = async (movieId: number) => {
    try {
      const res = await api.toggleDislike(movieId);

      setUser(res.user);
    } catch (err) {
      console.error('Dislike toggle error:', err);
    }
  };

  const handleToggleWatched = async (movieId: number) => {
    try {
      const res = await api.toggleWatched(movieId);

      setUser(res.user);
    } catch (err) {
      console.error('Watched toggle error:', err);
    }
  };

  /*
   * ---------------------------------------------------------
   * AUTH SUCCESS
   * ---------------------------------------------------------
   */

  const handleAuthenticationSuccess = (
    authenticatedUser: UserProfile
  ) => {
    setUser(authenticatedUser);
    setIsAuthModalOpen(false);

    /*
     * After successful login/register, check whether this
     * is a brand-new user who should complete onboarding.
     */
    if (authenticatedUser.interactionCount === 0) {
      const onboardingDone = localStorage.getItem(
        `cinemeta_onboarded_${authenticatedUser.id}`
      );

      if (!onboardingDone) {
        setIsOnboardingModalOpen(true);
      }
    }
  };

  /*
   * ---------------------------------------------------------
   * LOGOUT
   * ---------------------------------------------------------
   */

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }

    localStorage.removeItem('cinemeta_token');

    setUser(null);
    setAllMovies([]);
    setCurrentView('home');
    setIsOnboardingModalOpen(false);
    setIsAiAssistantOpen(false);
  };

  /*
   * ---------------------------------------------------------
   * SESSION LOADING SCREEN
   * ---------------------------------------------------------
   */

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-900/40">
            <span className="font-black">C</span>
          </div>

          <p className="text-sm text-zinc-400">
            Opening CINEMETA...
          </p>
        </div>
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * AUTHENTICATION GATE
   * ---------------------------------------------------------
   *
   * No logged-in user = show authentication screen.
   *
   * The rest of the application is not rendered until the
   * user signs in or registers.
   */

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AuthModal
          onClose={() => {
            // Keep authentication required.
          }}
          onSuccess={handleAuthenticationSuccess}
        />
      </div>
    );
  }

  /*
   * ---------------------------------------------------------
   * MAIN APPLICATION
   * ---------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-red-600 selection:text-white flex flex-col">

      {/* Navbar */}
      <Navbar
        currentView={currentView}
        setCurrentView={(view) =>
          setCurrentView(view as any)
        }
        user={user}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenMovieModal={(movie) =>
          setSelectedMovieModal(movie)
        }
        onOpenOnboarding={() =>
          setIsOnboardingModalOpen(true)
        }
        onOpenAiAssistant={() =>
          setIsAiAssistantOpen(true)
        }
      />

      {/* Main content */}
      <main className="flex-1 pb-16">

        {/* Home */}
        {currentView === 'home' && (
          <HomePage
            user={user}
            allMovies={allMovies}
            onOpenDetails={(movie) =>
              setSelectedMovieModal(movie)
            }
            onPlayTrailer={(movie) =>
              setTrailerModalMovie(movie)
            }
            onToggleWatchlist={handleToggleWatchlist}
            onRateMovie={handleRateMovie}
            onNavigateToRecommendations={() =>
              setCurrentView('recommendations')
            }
          />
        )}

        {/* Recommendations */}
        {currentView === 'recommendations' && (
          <ColdStartWizard
            user={user}
            allMovies={allMovies}
            onOpenDetails={(movie) =>
              setSelectedMovieModal(movie)
            }
            onPlayTrailer={(movie) =>
              setTrailerModalMovie(movie)
            }
            onToggleWatchlist={handleToggleWatchlist}
            onRateMovie={handleRateMovie}
            onOpenOnboarding={() =>
              setIsOnboardingModalOpen(true)
            }
          />
        )}

        {/* Watchlist */}
        {currentView === 'watchlist' && (
          <WatchlistPage
            user={user}
            allMovies={allMovies}
            onOpenDetails={(movie) =>
              setSelectedMovieModal(movie)
            }
            onPlayTrailer={(movie) =>
              setTrailerModalMovie(movie)
            }
            onToggleWatchlist={handleToggleWatchlist}
            onRateMovie={handleRateMovie}
          />
        )}

        {/* Profile */}
        {currentView === 'profile' && (
          <ProfilePage
            user={user}
            onUpdateUser={(updated) =>
              setUser(updated)
            }
            onOpenOnboarding={() =>
              setIsOnboardingModalOpen(true)
            }
            onLogout={handleLogout}
          />
        )}

        {/* Admin */}
        {currentView === 'admin' && (
          <AdminDashboardPage
            allMovies={allMovies}
          />
        )}
      </main>

      {/* Floating assistant */}
      <button
        onClick={() => setIsAiAssistantOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-zinc-700/60 bg-zinc-900/95 px-4 py-3 text-sm font-medium text-zinc-100 shadow-xl shadow-black/30 transition-all duration-200 hover:-translate-y-1 hover:bg-zinc-800"
        title="Ask CINEMETA"
        id="floating-ai-assistant-btn"
      >
        <Bot className="w-4 h-4" />
        <span>Ask CINEMETA</span>
      </button>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-center">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 text-xs text-zinc-500">
          <span className="font-semibold tracking-wide text-zinc-300">
            CINEMETA
          </span>

          <span>
            Find something worth watching.
          </span>
        </div>
      </footer>

      {/* Movie details */}
      {selectedMovieModal && (
        <MovieDetailModal
          movie={selectedMovieModal}
          isInWatchlist={
            user.watchlistMovieIds?.includes(
              selectedMovieModal.id
            ) || false
          }
          isLiked={
            user.likedMovieIds?.includes(
              selectedMovieModal.id
            ) || false
          }
          isDisliked={
            user.dislikedMovieIds?.includes(
              selectedMovieModal.id
            ) || false
          }
          isWatched={
            user.watchedMovieIds?.includes(
              selectedMovieModal.id
            ) || false
          }
          userRating={
            user.ratings[selectedMovieModal.id]
          }
          onClose={() =>
            setSelectedMovieModal(null)
          }
          onSelectMovie={(movie) =>
            setSelectedMovieModal(movie)
          }
          onPlayTrailer={(movie) => {
            setSelectedMovieModal(null);
            setTrailerModalMovie(movie);
          }}
          onToggleWatchlist={handleToggleWatchlist}
          onToggleLike={handleToggleLike}
          onToggleDislike={handleToggleDislike}
          onToggleWatched={handleToggleWatched}
          onRateMovie={handleRateMovie}
        />
      )}

      {/* Trailer */}
      {trailerModalMovie && (
        <TrailerModal
          movie={trailerModalMovie}
          onClose={() =>
            setTrailerModalMovie(null)
          }
        />
      )}

      {/* Manual auth modal */}
      {isAuthModalOpen && (
        <AuthModal
          onClose={() =>
            setIsAuthModalOpen(false)
          }
          onSuccess={handleAuthenticationSuccess}
        />
      )}

      {/* Onboarding */}
      {isOnboardingModalOpen && (
        <OnboardingModal
          isOpen={isOnboardingModalOpen}
          onClose={() =>
            setIsOnboardingModalOpen(false)
          }
          onComplete={(updatedUser) => {
            setUser(updatedUser);
            setIsOnboardingModalOpen(false);

            if (updatedUser) {
              localStorage.setItem(
                `cinemeta_onboarded_${updatedUser.id}`,
                'true'
              );
            }

            setCurrentView('recommendations');
          }}
        />
      )}

      {/* AI assistant */}
      {isAiAssistantOpen && (
        <AiAssistantModal
          isOpen={isAiAssistantOpen}
          onClose={() =>
            setIsAiAssistantOpen(false)
          }
          onSelectMovie={(movie) =>
            setSelectedMovieModal(movie)
          }
        />
      )}
    </div>
  );
}