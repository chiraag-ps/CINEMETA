import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bot,
  ExternalLink,
  Search,
  Send,
  Star,
  X,
} from 'lucide-react';
import { Movie } from '../types';
import { api } from '../services/api';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectMovie?: (movie: Movie) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  recommendedMovies?: Movie[];
  createdAt: string;
}

const getPosterUrl = (posterPath?: string | null) => {
  if (!posterPath) return '';

  if (posterPath.startsWith('http://') || posterPath.startsWith('https://')) {
    return posterPath;
  }

  if (posterPath.startsWith('/')) {
    return `https://image.tmdb.org/t/p/w342${posterPath}`;
  }

  return '';
};

const getYear = (date?: string) => {
  if (!date) return '';
  return date.slice(0, 4);
};

const getGenreNames = (movie: Movie) => {
  if (!Array.isArray(movie.genres)) return [];

  return movie.genres
    .map((genre) => (typeof genre === 'string' ? genre : genre.name))
    .filter(Boolean);
};

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  onSelectMovie,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Stores a poster URL that has already been resolved successfully.
  const [posterUrls, setPosterUrls] = useState<Record<number, string>>({});

  // Prevent repeated TMDB searches for the same movie.
  const [posterLookups, setPosterLookups] = useState<Record<number, boolean>>({});

  const suggestions = useMemo(
    () => [
      'Recommend a Kannada thriller movie',
      'Suggest a light comedy for tonight',
      'Find a mind-bending sci-fi movie',
    ],
    [],
  );

  useEffect(() => {
    if (!isOpen) return;

    setMessages([
      {
        id: createId(),
        role: 'assistant',
        content:
          'Tell me what you are in the mood for, and I’ll find a few movies from the CINEMETA catalog.',
        createdAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ]);

    setInput('');
    setPosterUrls({});
    setPosterLookups({});
  }, [isOpen]);

  const validatePosterUrl = (url: string): Promise<boolean> =>
    new Promise((resolve) => {
      const image = new Image();

      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);

      image.src = url;
    });

  const findValidPoster = async (movie: Movie): Promise<string> => {
    const candidates: string[] = [];

    // 1. Try the poster already attached to the movie.
    const directUrl = getPosterUrl(movie.poster_path);
    if (directUrl) candidates.push(directUrl);

    // 2. Refresh the movie details from TMDB using the movie ID.
    try {
      const details = await api.getMovieDetails(movie.id);
      const detailUrl = getPosterUrl(details.poster_path);

      if (detailUrl && !candidates.includes(detailUrl)) {
        candidates.push(detailUrl);
      }
    } catch (error) {
      console.warn(`Movie details lookup failed for ${movie.title}`, error);
    }

    // 3. Search by title and prefer the same release year when possible.
    try {
      const results = await api.searchMovies(movie.title);

      const originalYear = movie.release_date?.slice(0, 4);

      const orderedResults = [...results].sort((a, b) => {
        const aExactTitle =
          a.title.trim().toLowerCase() === movie.title.trim().toLowerCase();
        const bExactTitle =
          b.title.trim().toLowerCase() === movie.title.trim().toLowerCase();

        const aYearMatch =
          Boolean(originalYear) &&
          a.release_date?.slice(0, 4) === originalYear;
        const bYearMatch =
          Boolean(originalYear) &&
          b.release_date?.slice(0, 4) === originalYear;

        return Number(bExactTitle) - Number(aExactTitle) +
          (Number(bYearMatch) - Number(aYearMatch));
      });

      for (const result of orderedResults) {
        const url = getPosterUrl(result.poster_path);

        if (url && !candidates.includes(url)) {
          candidates.push(url);
        }
      }
    } catch (error) {
      console.warn(`Poster search failed for ${movie.title}`, error);
    }

    // 4. Only return a URL after the browser confirms that the image loads.
    for (const url of candidates) {
      const valid = await validatePosterUrl(url);

      if (valid) return url;
    }

    return '';
  };

  const resolvePoster = async (movie: Movie) => {
    if (posterLookups[movie.id]) return;

    setPosterLookups((prev) => ({
      ...prev,
      [movie.id]: true,
    }));

    try {
      const validPoster = await findValidPoster(movie);

      if (validPoster) {
        setPosterUrls((prev) => ({
          ...prev,
          [movie.id]: validPoster,
        }));
      } else {
        // Keep the placeholder instead of ever rendering a broken image.
        setPosterUrls((prev) => {
          const next = { ...prev };
          delete next[movie.id];
          return next;
        });
      }
    } catch (error) {
      console.warn(`Could not resolve poster for ${movie.title}`, error);
    }
  };

  const handleSend = async (event?: FormEvent) => {
    event?.preventDefault();

    const message = input.trim();
    if (!message || isSending) return;

    setInput('');
    setIsSending(true);

    const now = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    setMessages((prev) => [
      ...prev,
      {
        id: createId(),
        role: 'user',
        content: message,
        createdAt: now,
      },
    ]);

    try {
      const response = await api.sendAssistantMessage(message);

      const recommendedMovies = response.recommendedMovies || [];

      recommendedMovies.forEach((movie) => {
        void resolvePoster(movie);
      });

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          content:
            response.reply ||
            'Here are a few movies that match your request.',
          recommendedMovies,
          createdAt: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ]);
    } catch (error) {
      console.error('Assistant error:', error);

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          content:
            'I could not reach the movie assistant right now. Please try again.',
          createdAt: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="flex h-[min(760px,92vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white">
              <Bot className="h-5 w-5" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white sm:text-base">
                  CINEMETA AI Assistant
                </h2>
                <span className="rounded-full border border-emerald-700/60 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  Grounded Catalog
                </span>
              </div>

              <p className="text-xs text-zinc-400">
                Find movies by mood, genre, language, or theme.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
            aria-label="Close assistant"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'flex justify-end'
                    : 'flex justify-start'
                }
              >
                <div
                  className={
                    message.role === 'user'
                      ? 'max-w-[86%] rounded-2xl rounded-br-md bg-red-600 px-4 py-3 text-sm text-white'
                      : 'w-full max-w-[95%] rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900 px-4 py-3'
                  }
                >
                  <p className="text-sm leading-6 text-zinc-100">
                    {message.content}
                  </p>

                  <div className="mt-2 text-[10px] text-zinc-500">
                    {message.createdAt}
                  </div>

                  {message.role === 'assistant' &&
                    message.recommendedMovies &&
                    message.recommendedMovies.length > 0 && (
                      <div className="mt-4 border-t border-zinc-800 pt-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Matches from the catalog
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {message.recommendedMovies.map((movie) => {
                            const resolvedPoster =
                              posterUrls[movie.id] ||
                              getPosterUrl(movie.poster_path);

                            const genres = getGenreNames(movie).slice(0, 2);

                            return (
                              <div
                                key={movie.id}
                                className="flex min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950"
                              >
                                <div className="h-28 w-20 shrink-0 overflow-hidden bg-zinc-900">
                                  {resolvedPoster ? (
                                    <img
                                      src={resolvedPoster}
                                      alt={movie.title}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      onError={() => {
                                        setPosterUrls((prev) => {
                                          const next = { ...prev };
                                          delete next[movie.id];
                                          return next;
                                        });
                                      }}
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-[11px] text-zinc-600">
                                      <Search className="h-4 w-4" />
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1 p-3">
                                  <h3 className="truncate text-sm font-semibold text-white">
                                    {movie.title}
                                  </h3>

                                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                                    {getYear(movie.release_date) && (
                                      <span>{getYear(movie.release_date)}</span>
                                    )}

                                    <span className="inline-flex items-center gap-1 text-amber-400">
                                      <Star className="h-3 w-3 fill-current" />
                                      {Number(movie.vote_average || 0).toFixed(1)}
                                    </span>
                                  </div>

                                  {genres.length > 0 && (
                                    <div className="mt-1 truncate text-[11px] text-zinc-500">
                                      {genres.join(' · ')}
                                    </div>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => onSelectMovie?.(movie)}
                                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-red-400 transition hover:text-red-300"
                                  >
                                    View details & streaming
                                    <ExternalLink className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-500">
                  Looking through the catalog…
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Suggestions + Input */}
        <div className="border-t border-zinc-800 bg-zinc-950 px-4 pb-4 pt-3 sm:px-5">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setInput(suggestion)}
                className="whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] text-zinc-400 transition hover:border-zinc-700 hover:text-white"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <form onSubmit={handleSend} className="flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask for a movie…"
              disabled={isSending}
              className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-red-500"
            />

            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AiAssistantModal;