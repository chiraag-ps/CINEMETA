import {
  Movie,
  UserProfile,
  RecommendationResult,
  UserReview,
  RecommendationHistoryEntry,
  SystemAnalytics,
  WatchProvidersResponse,
  MovieTrailerResult,
  OnboardingPreferences,
  NlpSearchFilter,
} from '../types';

const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('cinemeta_token');

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

function jsonHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...getAuthHeaders(),
  };
}

async function parseResponse<T>(res: Response): Promise<T> {
  let data: any = null;

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data?.error ||
      data?.message ||
      `Request failed with status ${res.status}`;

    throw new Error(message);
  }

  return data as T;
}

async function get<T>(url: string, authenticated = false): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'GET',
    headers: authenticated ? getAuthHeaders() : {},
  });

  return parseResponse<T>(res);
}

async function post<T>(
  url: string,
  body?: unknown,
  authenticated = false,
): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: authenticated ? jsonHeaders() : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseResponse<T>(res);
}

async function put<T>(
  url: string,
  body?: unknown,
  authenticated = false,
): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'PUT',
    headers: authenticated ? jsonHeaders() : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return parseResponse<T>(res);
}

export const api = {
  // ============================================================
  // AUTH
  // ============================================================

  async register(
    name: string,
    email: string,
    password: string,
    avatar?: string,
  ): Promise<{
    user: UserProfile;
    token: string;
  }> {
    const data = await post<{
      user: UserProfile;
      token: string;
    }>('/auth/register', {
      name,
      email,
      password,
      avatar,
    });

    if (data.token) {
      localStorage.setItem('cinemeta_token', data.token);
    }

    return data;
  },

  async login(
    email: string,
    password: string,
  ): Promise<{
    user: UserProfile;
    token: string;
  }> {
    const data = await post<{
      user: UserProfile;
      token: string;
    }>('/auth/login', {
      email,
      password,
    });

    if (data.token) {
      localStorage.setItem('cinemeta_token', data.token);
    }

    return data;
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch {
      // Logout should always clear the local token.
    } finally {
      localStorage.removeItem('cinemeta_token');
    }
  },

  async getMe(): Promise<{
    user: UserProfile;
    isGuest: boolean;
  }> {
    return get('/auth/me', true);
  },

  async getProfile(): Promise<UserProfile> {
    const data = await get<{
      user: UserProfile;
    }>('/auth/me', true);

    return data.user;
  },

  async getUserProfile(): Promise<UserProfile> {
    const data = await get<{
      profile: UserProfile;
    }>('/users/profile', true);

    return data.profile;
  },

  // ============================================================
  // ONBOARDING
  // ============================================================

  async submitOnboarding(payload: {
    favoriteMovieIds: number[];
    favoriteGenres: string[];
    preferredLanguages: string[];
    preferences: OnboardingPreferences;
    favoriteMovies?: Movie[];
  }): Promise<{
    user: UserProfile;
    message: string;
  }> {
    return post('/onboarding', payload, true);
  },

  // ============================================================
  // USER PREFERENCES
  // ============================================================

  async updatePreferences(
    preferences: Partial<UserProfile>,
  ): Promise<UserProfile> {
    const data = await put<{
      user: UserProfile;
    }>('/user/preferences', preferences, true);

    return data.user;
  },

  // ============================================================
  // USER MOVIE ACTIONS
  // ============================================================

  async rateMovie(
    movieId: number,
    rating: number,
  ): Promise<UserProfile> {
    const data = await post<{
      user: UserProfile;
    }>(
      '/user/rate',
      {
        movieId,
        rating,
      },
      true,
    );

    return data.user;
  },

  async toggleWatchlist(
    movieId: number,
  ): Promise<{
    inWatchlist: boolean;
    user: UserProfile;
  }> {
    return post(
      '/user/watchlist/toggle',
      {
        movieId,
      },
      true,
    );
  },

  async toggleLike(
    movieId: number,
  ): Promise<{
    isLiked: boolean;
    user: UserProfile;
  }> {
    return post(
      '/user/like/toggle',
      {
        movieId,
      },
      true,
    );
  },

  async toggleDislike(
    movieId: number,
  ): Promise<{
    isDisliked: boolean;
    user: UserProfile;
  }> {
    return post(
      '/user/dislike/toggle',
      {
        movieId,
      },
      true,
    );
  },

  async toggleWatched(
    movieId: number,
  ): Promise<{
    isWatched: boolean;
    user: UserProfile;
  }> {
    return post(
      '/user/watched/toggle',
      {
        movieId,
      },
      true,
    );
  },

  // ============================================================
  // MOVIES
  // ============================================================

  async getPopularMovies(): Promise<Movie[]> {
    const data = await get<{
      movies?: Movie[];
    }>('/movies/popular');

    return data.movies || [];
  },

  async getTopRatedMovies(): Promise<Movie[]> {
    const data = await get<{
      movies?: Movie[];
    }>('/movies/top-rated');

    return data.movies || [];
  },

  async getTrendingMovies(): Promise<Movie[]> {
    const data = await get<{
      movies?: Movie[];
    }>('/movies/trending');

    return data.movies || [];
  },

  async searchMovies(query: string): Promise<Movie[]> {
    const data = await get<{
      movies?: Movie[];
    }>(
      `/movies/search?q=${encodeURIComponent(query)}`,
    );

    return data.movies || [];
  },

  async getMovieDetails(id: number): Promise<Movie> {
    const data = await get<{
      movie: Movie;
    }>(`/movies/${id}`);

    return data.movie;
  },

  async getSimilarMovies(
    id: number,
    limit: number = 6,
  ): Promise<RecommendationResult[]> {
    const data = await get<{
      similar?: RecommendationResult[];
    }>(
      `/movies/${id}/similar?limit=${encodeURIComponent(String(limit))}`,
    );

    return data.similar || [];
  },

  async getMovieTrailer(
    id: number,
  ): Promise<MovieTrailerResult> {
    return get<MovieTrailerResult>(
      `/movies/${id}/trailer`,
    );
  },

  async getWatchProviders(
    id: number,
    region: string = 'IN',
  ): Promise<WatchProvidersResponse> {
    return get<WatchProvidersResponse>(
      `/movies/${id}/providers?region=${encodeURIComponent(region)}`,
    );
  },

  // ============================================================
  // NATURAL LANGUAGE SEARCH
  // ============================================================

  async nlpSearch(
    query: string,
    diversityLambda?: number,
  ): Promise<{
    extractedFilters: NlpSearchFilter;
    recommendations: RecommendationResult[];
  }> {
    const data = await post<{
      extractedFilters: NlpSearchFilter;
      results?: RecommendationResult[];
    }>(
      '/movies/nlp-search',
      {
        query,
        diversityLambda,
      },
      true,
    );

    return {
      extractedFilters: data.extractedFilters,
      recommendations: data.results || [],
    };
  },

  async searchByNaturalLanguage(
    query: string,
  ): Promise<{
    extractedFilters: NlpSearchFilter;
    results: RecommendationResult[];
  }> {
    return post(
      '/movies/nlp-search',
      {
        query,
      },
      true,
    );
  },

  // ============================================================
  // AI MOVIE ASSISTANT
  // ============================================================

  async sendAssistantMessage(
    message: string,
  ): Promise<{
    reply: string;
    recommendedMovies?: Movie[];
    extractedFilters?: any;
  }> {
    return post(
      '/ai/assistant',
      {
        message,
      },
      true,
    );
  },

  // ============================================================
  // RECOMMENDATION ENGINE
  // ============================================================

  /**
   * IMPORTANT:
   *
   * The frontend does NOT import recommenderEngine anymore.
   *
   * All recommendation generation is delegated to:
   *
   * POST /api/recommendations/generate
   *
   * The backend decides which algorithm/stage to use.
   */
  async generateRecommendations(options?: {
    selectedMovieIds?: number[];
    selectedMovies?: Movie[];
    diversityLambda?: number;
  }): Promise<{
    recommendations: RecommendationResult[];
    algorithmUsed: string;
    interactionCount: number;
    metaDecisionReason: string;
    metrics: any;
  }> {
    return post(
      '/recommendations/generate',
      options || {},
      true,
    );
  },

  // ============================================================
  // REVIEWS
  // ============================================================

  async getMovieReviews(
    movieId: number,
  ): Promise<UserReview[]> {
    const data = await get<{
      reviews?: UserReview[];
    }>(`/reviews/${movieId}`);

    return data.reviews || [];
  },

  async addReview(
    movieId: number,
    rating: number,
    comment: string,
  ): Promise<UserReview> {
    const data = await post<{
      review: UserReview;
    }>(
      '/reviews',
      {
        movieId,
        rating,
        comment,
      },
      true,
    );

    return data.review;
  },

  // ============================================================
  // RECOMMENDATION HISTORY
  // ============================================================

  async getHistory(): Promise<RecommendationHistoryEntry[]> {
    const data = await get<{
      history?: RecommendationHistoryEntry[];
    }>('/history', true);

    return data.history || [];
  },

  // ============================================================
  // ADMIN ANALYTICS
  // ============================================================

  async getAdminAnalytics(): Promise<SystemAnalytics> {
    const data = await get<{
      analytics: SystemAnalytics;
    }>('/admin/analytics', true);

    return data.analytics;
  },

  // ============================================================
  // SECURITY TESTS
  // ============================================================

  async runSecurityTests(): Promise<{
    summary: string;
    totalTests: number;
    passedCount: number;
    tests: Array<{
      threat: string;
      attackScenario: string;
      mitigation: string;
      status: 'PASSED' | 'FAILED';
      details: string;
    }>;
  }> {
    return get('/admin/security-test', true);
  },
};