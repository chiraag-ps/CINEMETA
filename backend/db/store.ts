import {
  Movie,
  UserProfile,
  UserReview,
  RecommendationHistoryEntry,
  UserStructuredVector,
  OnboardingPreferences,
} from '../../src/types';

import { INITIAL_MOVIES } from '../../src/data/mockMovies';

import {
  UserModel,
  MovieModel,
  ReviewModel,
  HistoryModel,
} from './mongo';

/* =========================================================
   TYPES
   ========================================================= */

type StoredUser = UserProfile & {
  passwordHash: string;
};

type HistoryWithUser = RecommendationHistoryEntry & {
  userId?: string;
};

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeString(s?: string): string {
  return (s || '').trim();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
}

function getAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
    name
  )}`;
}

function toISOString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

/* =========================================================
   DATABASE STORE
   ========================================================= */

class DatabaseStore {
  private movies: Map<number, Movie> = new Map();

  private users: Map<string, StoredUser> = new Map();

  private reviews: UserReview[] = [];

  private history: HistoryWithUser[] = [];

  private mongoEnabled = false;

  /* =======================================================
     INITIALIZATION
     ======================================================= */

  constructor() {
    this.loadInitialMovies();
    this.createDemoUser();
  }

  /**
   * Called after MongoDB connection has been established.
   *
   * MongoDB becomes the persistent source of truth.
   * The Maps/arrays remain the runtime cache.
   */
  public async initializeMongo(): Promise<void> {
    if (!this.isMongoConnected()) {
      console.log(
        'ℹ️ MongoDB is not available. Using local memory store.'
      );

      return;
    }

    console.log('🔄 Initializing CINEMETA MongoDB persistence...');

    try {
      this.mongoEnabled = true;

      /* ---------------------------------------------------
         USERS
         --------------------------------------------------- */

      const mongoUsers = await UserModel.find().lean();

      for (const rawUser of mongoUsers) {
        const user = this.mongoUserToUser(rawUser);

        if (!user) {
          continue;
        }

        this.users.set(
          normalizeString(user.email).toLowerCase(),
          user
        );
      }

      /* ---------------------------------------------------
         MOVIES
         --------------------------------------------------- */

      const mongoMovies = await MovieModel.find().lean();

      for (const rawMovie of mongoMovies) {
        const movie = this.mongoMovieToMovie(rawMovie);

        if (!movie) {
          continue;
        }

        this.movies.set(movie.id, movie);
      }

      /* ---------------------------------------------------
         REVIEWS
         --------------------------------------------------- */

      const mongoReviews = await ReviewModel.find()
        .sort({ createdAt: -1 })
        .lean();

      this.reviews = mongoReviews.map((review: any) => ({
        id: review.id,
        userId: review.userId,
        userName: review.userName,
        movieId: Number(review.movieId),
        rating: Number(review.rating),
        comment: review.comment || '',
        createdAt: toISOString(review.createdAt),
      }));

      /* ---------------------------------------------------
         HISTORY
         --------------------------------------------------- */

      const mongoHistory = await HistoryModel.find()
        .sort({ timestamp: -1 })
        .lean();

      this.history = mongoHistory.map((entry: any) => ({
        id: entry.id,
        userId: entry.userId,

        selectedMovieIds: Array.isArray(
          entry.selectedMovieIds
        )
          ? entry.selectedMovieIds.map(Number)
          : [],

        algorithmUsed:
          entry.algorithmUsed || '',

        interactionCountAtTime:
          Number(entry.interactionCountAtTime) || 0,

        recommendationsCount:
          Number(entry.recommendationsCount) || 0,

        topRecommendedMovieTitles:
          Array.isArray(entry.topRecommendedMovieTitles)
            ? entry.topRecommendedMovieTitles
            : [],

        diversityScore:
          Number(entry.diversityScore) || 0,

        timestamp: toISOString(entry.timestamp),
      }));

      console.log(
        `✅ MongoDB loaded: ${this.users.size} users, ${this.movies.size} movies, ${this.reviews.length} reviews, ${this.history.length} history records`
      );

      /* ---------------------------------------------------
         SYNC INITIAL MOVIE CATALOG
         --------------------------------------------------- */

      await this.persistInitialMovies();

      /* ---------------------------------------------------
         ENSURE DEMO USER EXISTS
         --------------------------------------------------- */

      await this.persistAllUsers();

      console.log(
        '✅ CINEMETA MongoDB persistence layer ready.'
      );
    } catch (error) {
      console.error(
        '❌ Failed to initialize MongoDB data:',
        error
      );

      this.mongoEnabled = false;

      console.log(
        '⚠️ Continuing with local memory store.'
      );
    }
  }

  private isMongoConnected(): boolean {
    return UserModel.db.readyState === 1;
  }

  /* =======================================================
     INITIAL MOVIES
     ======================================================= */

  private loadInitialMovies(): void {
    INITIAL_MOVIES.forEach((movie) => {
      const genresList = Array.isArray(movie.genres)
        ? movie.genres.map((genre) =>
            typeof genre === 'string'
              ? genre.toLowerCase()
              : genre.name.toLowerCase()
          )
        : [];

      const moods: string[] = [];

      if (
        genresList.includes('sci-fi') ||
        genresList.includes('mystery')
      ) {
        moods.push(
          'Thought-provoking',
          'Suspenseful'
        );
      }

      if (
        genresList.includes('thriller') ||
        genresList.includes('horror') ||
        genresList.includes('crime')
      ) {
        moods.push(
          'Suspenseful',
          'Dark'
        );
      }

      if (
        genresList.includes('comedy') ||
        genresList.includes('animation') ||
        genresList.includes('family')
      ) {
        moods.push(
          'Fun',
          'Relaxing'
        );
      }

      if (
        genresList.includes('drama') ||
        genresList.includes('romance')
      ) {
        moods.push(
          'Emotional',
          'Inspirational'
        );
      }

      if (
        genresList.includes('action') ||
        genresList.includes('adventure')
      ) {
        moods.push(
          'Inspirational',
          'Fun'
        );
      }

      this.movies.set(movie.id, {
        ...movie,
        moods: Array.from(new Set(moods)),
      });
    });
  }

  /* =======================================================
     DEMO USER
     ======================================================= */

  private createDemoUser(): void {
    const existing = this.getUserById(
      'demo-user-123'
    );

    if (existing) {
      return;
    }

    const demoVector: UserStructuredVector = {
      genres: {
        'Sci-Fi': 0.92,
        Thriller: 0.81,
        Action: 0.7,
        Drama: 0.51,
        Comedy: 0.32,
      },

      languages: {
        en: 0.9,
        kn: 0.75,
        hi: 0.6,
      },

      moods: {
        'Thought-provoking': 0.88,
        Suspenseful: 0.8,
        Inspirational: 0.65,
      },

      rating_preference: 4.3,

      runtime_preference: 125,

      decade_preference: '2010s',
    };

    const demoUser: StoredUser = {
      id: 'demo-user-123',

      name: 'Demo User',

      email: 'demo@cinemeta.ai',

      passwordHash:
        '$2a$10$7EqJtq98hPqEX7fNZaFWoOZhB7m9uKq9hK/Jm1B3C/6O6u4x4j4yq',

      interactionCount: 4,

      onboardingCompleted: true,

      onboardingPreferences: {
        preferredDecade: '2010s',
        minRating: 7.0,
        maxRuntime: 150,
        movieType: 'feature',
        moods: [
          'Thought-provoking',
          'Suspenseful',
        ],
      },

      structuredPreferenceVector: demoVector,

      favoriteGenres: [
        'Sci-Fi',
        'Action',
        'Thriller',
      ],

      preferredLanguages: [
        'en',
        'kn',
      ],

      favoriteActors: [
        'Leonardo DiCaprio',
        'Matthew McConaughey',
      ],

      favoriteDirectors: [
        'Christopher Nolan',
        'Denis Villeneuve',
      ],

      likedMovieIds: [
        157336,
        27205,
      ],

      dislikedMovieIds: [],

      watchlistMovieIds: [
        693134,
      ],

      watchedMovieIds: [
        157336,
        27205,
        118340,
      ],

      ratings: {
        157336: 5,
        27205: 5,
        118340: 4,
      },

      avatar: getAvatar('Demo User'),

      createdAt: new Date().toISOString(),
    };

    this.users.set(
      demoUser.email.toLowerCase(),
      demoUser
    );
  }

  /* =======================================================
     MONGODB → USER
     ======================================================= */

  private mongoUserToUser(
    raw: any
  ): StoredUser | null {
    if (!raw) {
      return null;
    }

    if (!raw.id || !raw.email) {
      console.warn(
        '⚠️ Skipping invalid MongoDB user record:',
        raw
      );

      return null;
    }

    return {
      id: String(raw.id),

      name: raw.name || 'CINEMETA User',

      email: String(raw.email).toLowerCase(),

      passwordHash: raw.passwordHash || '',

      avatar:
        raw.avatar ||
        getAvatar(raw.name || raw.email),

      interactionCount:
        Number(raw.interactionCount) || 0,

      onboardingCompleted:
        Boolean(raw.onboardingCompleted),

      onboardingPreferences:
        raw.onboardingPreferences || {},

      structuredPreferenceVector:
        raw.structuredPreferenceVector || {
          genres: {},
          languages: {
            en: 1,
          },
          moods: {},
          rating_preference: 4,
          runtime_preference: 120,
          decade_preference: '2020s',
        },

      favoriteGenres:
        Array.isArray(raw.favoriteGenres)
          ? raw.favoriteGenres
          : [],

      preferredLanguages:
        Array.isArray(raw.preferredLanguages)
          ? raw.preferredLanguages
          : ['en'],

      favoriteActors:
        Array.isArray(raw.favoriteActors)
          ? raw.favoriteActors
          : [],

      favoriteDirectors:
        Array.isArray(raw.favoriteDirectors)
          ? raw.favoriteDirectors
          : [],

      likedMovieIds:
        Array.isArray(raw.likedMovieIds)
          ? raw.likedMovieIds.map(Number)
          : [],

      dislikedMovieIds:
        Array.isArray(raw.dislikedMovieIds)
          ? raw.dislikedMovieIds.map(Number)
          : [],

      watchlistMovieIds:
        Array.isArray(raw.watchlistMovieIds)
          ? raw.watchlistMovieIds.map(Number)
          : [],

      watchedMovieIds:
        Array.isArray(raw.watchedMovieIds)
          ? raw.watchedMovieIds.map(Number)
          : [],

      ratings:
        raw.ratings || {},

      createdAt: toISOString(
        raw.createdAt
      ),
    };
  }

  /* =======================================================
     MONGODB → MOVIE
     ======================================================= */

  private mongoMovieToMovie(
    raw: any
  ): Movie | null {
    if (!raw || raw.id === undefined) {
      return null;
    }

    return {
      ...raw,

      id: Number(raw.id),

      title: raw.title || 'Untitled',

      overview: raw.overview || '',

      poster_path:
        raw.poster_path || '',

      backdrop_path:
        raw.backdrop_path || '',

      vote_average:
        Number(raw.vote_average) || 0,

      vote_count:
        Number(raw.vote_count) || 0,

      release_date:
        raw.release_date || '',

      popularity:
        Number(raw.popularity) || 0,

      runtime:
        Number(raw.runtime) || 0,

      language:
        raw.language || '',

      director:
        raw.director || '',

      actors:
        Array.isArray(raw.actors)
          ? raw.actors
          : [],

      keywords:
        Array.isArray(raw.keywords)
          ? raw.keywords
          : [],

      genres:
        Array.isArray(raw.genres)
          ? raw.genres
          : [],

      moods:
        Array.isArray(raw.moods)
          ? raw.moods
          : [],

      trailer_key:
        raw.trailer_key || undefined,
    };
  }

  /* =======================================================
     PERSIST USER
     ======================================================= */

  private async persistUser(
    user: StoredUser
  ): Promise<void> {
    if (!this.mongoEnabled) {
      return;
    }

    try {
      await UserModel.findOneAndUpdate(
  { id: user.id } as any,
        {
          $set: {
            id: user.id,

            name:
              normalizeString(user.name) ||
              'CINEMETA User',

            email:
              normalizeString(user.email).toLowerCase(),

            passwordHash:
              user.passwordHash,

            avatar:
              user.avatar ||
              getAvatar(user.name),

            interactionCount:
              Number(user.interactionCount) || 0,

            onboardingCompleted:
              Boolean(user.onboardingCompleted),

            onboardingPreferences:
              user.onboardingPreferences || {},

            structuredPreferenceVector:
              user.structuredPreferenceVector || {},

            favoriteGenres:
              user.favoriteGenres || [],

            preferredLanguages:
              user.preferredLanguages || ['en'],

            favoriteActors:
              user.favoriteActors || [],

            favoriteDirectors:
              user.favoriteDirectors || [],

            likedMovieIds:
              user.likedMovieIds || [],

            dislikedMovieIds:
              user.dislikedMovieIds || [],

            watchlistMovieIds:
              user.watchlistMovieIds || [],

            watchedMovieIds:
              user.watchedMovieIds || [],

            ratings:
              user.ratings || {},

            createdAt:
              new Date(user.createdAt),
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        }
      );
    } catch (error) {
      console.error(
        `❌ MongoDB user persistence error [${user.email}]:`,
        error
      );
    }
  }

  /* =======================================================
     PERSIST MOVIE
     ======================================================= */

  private async persistMovie(
    movie: Movie
  ): Promise<void> {
    if (!this.mongoEnabled) {
      return;
    }

    try {
      await MovieModel.findOneAndUpdate(
  { id: movie.id } as any,
        {
          $set: {
            id: movie.id,

            title:
              movie.title || 'Untitled',

            overview:
              movie.overview || '',

            poster_path:
              movie.poster_path || '',

            backdrop_path:
              movie.backdrop_path || '',

            vote_average:
              Number(movie.vote_average) || 0,

            vote_count:
              Number(movie.vote_count) || 0,

            release_date:
              movie.release_date || '',

            popularity:
              Number(movie.popularity) || 0,

            runtime:
              Number(movie.runtime) || 0,

            language:
              movie.language || '',

            director:
              movie.director || '',

            actors:
              movie.actors || [],

            keywords:
              movie.keywords || [],

            genres:
              movie.genres || [],

            moods:
              movie.moods || [],

            trailer_key:
              movie.trailer_key,
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        }
      );
    } catch (error) {
      console.error(
        `❌ MongoDB movie persistence error [${movie.id}]:`,
        error
      );
    }
  }

  /* =======================================================
     PERSIST INITIAL MOVIES
     ======================================================= */

  private async persistInitialMovies(): Promise<void> {
    if (!this.mongoEnabled) {
      return;
    }

    const movies = Array.from(
      this.movies.values()
    );

    for (const movie of movies) {
      await this.persistMovie(movie);
    }

    console.log(
      `✅ Movie catalog synchronized: ${movies.length} movies`
    );
  }

  /* =======================================================
     PERSIST ALL USERS
     ======================================================= */

  private async persistAllUsers(): Promise<void> {
    if (!this.mongoEnabled) {
      return;
    }

    const users = Array.from(
      this.users.values()
    );

    for (const user of users) {
      await this.persistUser(user);
    }

    console.log(
      `✅ User records synchronized: ${users.length} users`
    );
  }

  /* =======================================================
     MOVIE OPERATIONS
     ======================================================= */

  public getAllMovies(): Movie[] {
    return Array.from(
      this.movies.values()
    );
  }

  public getMovieById(
    id: number
  ): Movie | undefined {
    return this.movies.get(
      Number(id)
    );
  }

  public addOrUpdateMovie(
    movie: Movie
  ): void {
    const movieId = Number(movie.id);

    const existing =
      this.movies.get(movieId);

    if (existing) {
      const existingKeyIsPlaceholder =
        existing.id !== 27205 &&
        existing.trailer_key ===
          'YoHD9XEInc0';

      const newKeyIsPlaceholder =
        movieId !== 27205 &&
        movie.trailer_key ===
          'YoHD9XEInc0';

      let resolvedTrailerKey =
        movie.trailer_key;

      if (
        newKeyIsPlaceholder ||
        !resolvedTrailerKey
      ) {
        resolvedTrailerKey =
          !existingKeyIsPlaceholder &&
          existing.trailer_key
            ? existing.trailer_key
            : movieId === 27205
            ? 'YoHD9XEInc0'
            : undefined;
      }

      const merged: Movie = {
        ...existing,

        ...movie,

        id: movieId,

        trailer_key:
          resolvedTrailerKey,

        director:
          movie.director &&
          movie.director !==
            'Renowned Director'
            ? movie.director
            : existing.director,

        actors:
          movie.actors &&
          movie.actors.length > 0 &&
          movie.actors[0] !==
            'Featured Cast'
            ? movie.actors
            : existing.actors,
      };

      this.movies.set(
        movieId,
        merged
      );

      void this.persistMovie(
        merged
      );
    } else {
      const newMovie: Movie = {
        ...movie,

        id: movieId,
      };

      if (
        movieId !== 27205 &&
        newMovie.trailer_key ===
          'YoHD9XEInc0'
      ) {
        newMovie.trailer_key =
          undefined;
      }

      this.movies.set(
        movieId,
        newMovie
      );

      void this.persistMovie(
        newMovie
      );
    }
  }

  public addMovies(
    moviesList: Movie[]
  ): void {
    moviesList.forEach(
      (movie) =>
        this.addOrUpdateMovie(movie)
    );
  }

  /* =======================================================
     USER OPERATIONS
     ======================================================= */

  public getUserByEmail(
    email: string
  ): StoredUser | undefined {
    return this.users.get(
      normalizeString(email).toLowerCase()
    );
  }

  public getUserById(
    id: string
  ): StoredUser | undefined {
    for (const user of this.users.values()) {
      if (user.id === id) {
        return user;
      }
    }

    return undefined;
  }

  public createUser(
    userData: {
      id: string;
      name: string;
      email: string;
      passwordHash: string;
      avatar?: string;
    }
  ): UserProfile {
    const normalizedEmail =
      normalizeString(
        userData.email
      ).toLowerCase();

    const newUser: StoredUser = {
      id: userData.id,

      name:
        normalizeString(
          userData.name
        ) || 'CINEMETA User',

      email: normalizedEmail,

      passwordHash:
        userData.passwordHash,

      avatar:
        userData.avatar ||
        getAvatar(
          userData.name
        ),

      interactionCount: 0,

      onboardingCompleted: false,

      favoriteGenres: [],

      preferredLanguages: [
        'en',
      ],

      favoriteActors: [],

      favoriteDirectors: [],

      likedMovieIds: [],

      dislikedMovieIds: [],

      watchlistMovieIds: [],

      watchedMovieIds: [],

      ratings: {},

      structuredPreferenceVector: {
        genres: {},

        languages: {
          en: 1.0,
        },

        moods: {},

        rating_preference: 4.0,

        runtime_preference: 120,

        decade_preference: '2020s',
      },

      createdAt:
        new Date().toISOString(),
    };

    this.users.set(
      normalizedEmail,
      newUser
    );

    void this.persistUser(
      newUser
    );

    return this.sanitizeUser(
      newUser
    );
  }

  public sanitizeUser(
    user: StoredUser | UserProfile
  ): UserProfile {
    const cleanUser = {
      ...user,
    } as any;

    delete cleanUser.passwordHash;

    return {
      ...cleanUser,

      avatar:
        cleanUser.avatar ||
        getAvatar(
          cleanUser.name
        ),

      preferredLanguages:
        cleanUser.preferredLanguages ||
        ['en'],

      watchedMovieIds:
        cleanUser.watchedMovieIds ||
        [],

      dislikedMovieIds:
        cleanUser.dislikedMovieIds ||
        [],

      likedMovieIds:
        cleanUser.likedMovieIds ||
        [],

      watchlistMovieIds:
        cleanUser.watchlistMovieIds ||
        [],

      ratings:
        cleanUser.ratings ||
        {},

      onboardingCompleted:
        Boolean(
          cleanUser.onboardingCompleted
        ),

      structuredPreferenceVector:
        cleanUser.structuredPreferenceVector ||
        this.calculateStructuredPreferenceVector(
          cleanUser
        ),
    };
  }

  /* =======================================================
     PREFERENCE VECTOR
     ======================================================= */

  public calculateStructuredPreferenceVector(
    user: UserProfile
  ): UserStructuredVector {
    const genreScores: Record<
      string,
      number
    > = {};

    const langScores: Record<
      string,
      number
    > = {};

    const moodScores: Record<
      string,
      number
    > = {};

    const runtimes: number[] = [];

    const ratingValues: number[] =
      Object.values(
        user.ratings || {}
      );

    /* -----------------------------------------------------
       ONBOARDING
       ----------------------------------------------------- */

    (
      user.favoriteGenres || []
    ).forEach((genre) => {
      genreScores[genre] =
        (genreScores[genre] || 0) +
        1.5;
    });

    (
      user.preferredLanguages || []
    ).forEach((language) => {
      langScores[language] =
        (langScores[language] || 0) +
        1.8;
    });

    (
      user.onboardingPreferences
        ?.moods || []
    ).forEach((mood) => {
      moodScores[mood] =
        (moodScores[mood] || 0) +
        1.5;
    });

    /* -----------------------------------------------------
       MOVIE SIGNAL
       ----------------------------------------------------- */

    const processMovieSignal = (
      movieId: number,
      weight: number
    ) => {
      const movie =
        this.getMovieById(
          Number(movieId)
        );

      if (!movie) {
        return;
      }

      if (
        movie.runtime &&
        movie.runtime > 0
      ) {
        runtimes.push(
          movie.runtime
        );
      }

      const genres =
        Array.isArray(
          movie.genres
        )
          ? movie.genres.map(
              (genre) =>
                typeof genre ===
                'string'
                  ? genre
                  : genre.name
            )
          : [];

      genres.forEach(
        (genre) => {
          genreScores[genre] =
            (genreScores[genre] ||
              0) + weight;
        }
      );

      if (movie.language) {
        langScores[
          movie.language
        ] =
          (langScores[
            movie.language
          ] || 0) +
          weight * 0.8;
      }

      if (
        movie.moods &&
        Array.isArray(
          movie.moods
        )
      ) {
        movie.moods.forEach(
          (mood) => {
            moodScores[mood] =
              (moodScores[mood] ||
                0) +
              weight * 0.7;
          }
        );
      }
    };

    /* -----------------------------------------------------
       RATINGS
       ----------------------------------------------------- */

    Object.entries(
      user.ratings || {}
    ).forEach(
      ([movieId, score]) => {
        let weight = 0.5;

        if (score === 5) {
          weight = 2.0;
        } else if (score === 4) {
          weight = 1.2;
        } else if (score === 3) {
          weight = 0.3;
        } else if (score === 2) {
          weight = -0.8;
        } else if (score === 1) {
          weight = -1.6;
        }

        processMovieSignal(
          Number(movieId),
          weight
        );
      }
    );

    /* -----------------------------------------------------
       LIKES
       ----------------------------------------------------- */

    (
      user.likedMovieIds || []
    ).forEach((movieId) => {
      processMovieSignal(
        movieId,
        1.5
      );
    });

    /* -----------------------------------------------------
       DISLIKES
       ----------------------------------------------------- */

    (
      user.dislikedMovieIds || []
    ).forEach((movieId) => {
      processMovieSignal(
        movieId,
        -1.8
      );
    });

    /* -----------------------------------------------------
       WATCHLIST
       ----------------------------------------------------- */

    (
      user.watchlistMovieIds || []
    ).forEach((movieId) => {
      processMovieSignal(
        movieId,
        0.8
      );
    });

    /* -----------------------------------------------------
       WATCHED
       ----------------------------------------------------- */

    (
      user.watchedMovieIds || []
    ).forEach((movieId) => {
      processMovieSignal(
        movieId,
        0.5
      );
    });

    /* -----------------------------------------------------
       NORMALIZATION
       ----------------------------------------------------- */

    const normalizeRecord = (
      record: Record<
        string,
        number
      >
    ): Record<
      string,
      number
    > => {
      const values =
        Object.values(record);

      const maxValue = Math.max(
        1,
        ...values
      );

      const result: Record<
        string,
        number
      > = {};

      for (const [
        key,
        value,
      ] of Object.entries(
        record
      )) {
        if (value > 0) {
          result[key] =
            Math.round(
              (value / maxValue) *
                100
            ) / 100;
        }
      }

      return result;
    };

    const averageRating =
      ratingValues.length > 0
        ? ratingValues.reduce(
            (a, b) => a + b,
            0
          ) /
          ratingValues.length
        : 4.2;

    const averageRuntime =
      runtimes.length > 0
        ? Math.round(
            runtimes.reduce(
              (a, b) => a + b,
              0
            ) /
              runtimes.length
          )
        : user
            .onboardingPreferences
            ?.maxRuntime || 120;

    return {
      genres:
        normalizeRecord(
          genreScores
        ),

      languages:
        normalizeRecord(
          langScores
        ),

      moods:
        normalizeRecord(
          moodScores
        ),

      rating_preference:
        Math.round(
          averageRating * 10
        ) / 10,

      runtime_preference:
        averageRuntime,

      decade_preference:
        user
          .onboardingPreferences
          ?.preferredDecade ||
        '2020s',
    };
  }

  /* =======================================================
     UPDATE USER
     ======================================================= */

  public updateUserPreferences(
    userId: string,
    updates: Partial<UserProfile>
  ): UserProfile | null {
    const user =
      this.getUserById(
        userId
      );

    if (!user) {
      return null;
    }

    if (
      updates.name !== undefined
    ) {
      user.name =
        updates.name;
    }

    if (
      updates.avatar !== undefined
    ) {
      user.avatar =
        updates.avatar;
    }

    if (
      updates.onboardingCompleted !==
      undefined
    ) {
      user.onboardingCompleted =
        updates.onboardingCompleted;
    }

    if (
      updates.onboardingPreferences !==
      undefined
    ) {
      user.onboardingPreferences =
        updates.onboardingPreferences;
    }

    if (
      updates.favoriteGenres !==
      undefined
    ) {
      user.favoriteGenres =
        updates.favoriteGenres;
    }

    if (
      updates.preferredLanguages !==
      undefined
    ) {
      user.preferredLanguages =
        updates.preferredLanguages;
    }

    if (
      updates.favoriteActors !==
      undefined
    ) {
      user.favoriteActors =
        updates.favoriteActors;
    }

    if (
      updates.favoriteDirectors !==
      undefined
    ) {
      user.favoriteDirectors =
        updates.favoriteDirectors;
    }

    if (
      updates.likedMovieIds !==
      undefined
    ) {
      user.likedMovieIds =
        updates.likedMovieIds;
    }

    if (
      updates.dislikedMovieIds !==
      undefined
    ) {
      user.dislikedMovieIds =
        updates.dislikedMovieIds;
    }

    if (
      updates.watchlistMovieIds !==
      undefined
    ) {
      user.watchlistMovieIds =
        updates.watchlistMovieIds;
    }

    if (
      updates.watchedMovieIds !==
      undefined
    ) {
      user.watchedMovieIds =
        updates.watchedMovieIds;
    }

    if (
      updates.ratings !==
      undefined
    ) {
      user.ratings =
        updates.ratings;
    }

    user.interactionCount =
      Object.keys(
        user.ratings || {}
      ).length +
      (user.likedMovieIds
        ?.length || 0) +
      (user.dislikedMovieIds
        ?.length || 0) +
      (user.watchedMovieIds
        ?.length || 0);

    user.structuredPreferenceVector =
      this.calculateStructuredPreferenceVector(
        user
      );

    this.users.set(
      user.email.toLowerCase(),
      user
    );

    void this.persistUser(
      user
    );

    return this.sanitizeUser(
      user
    );
  }

  /* =======================================================
     ONBOARDING
     ======================================================= */

  public saveOnboardingData(
    userId: string,
    data: {
      favoriteMovieIds: number[];
      favoriteGenres: string[];
      preferredLanguages: string[];
      preferences: OnboardingPreferences;
    }
  ): UserProfile | null {
    const user =
      this.getUserById(
        userId
      );

    if (!user) {
      return null;
    }

    user.onboardingCompleted =
      true;

    user.favoriteGenres =
      data.favoriteGenres || [];

    user.preferredLanguages =
      data.preferredLanguages ||
      ['en'];

    user.onboardingPreferences =
      data.preferences || {};

    if (
      data.favoriteMovieIds &&
      data.favoriteMovieIds.length >
        0
    ) {
      if (
        !user.likedMovieIds
      ) {
        user.likedMovieIds = [];
      }

      if (
        !user.watchedMovieIds
      ) {
        user.watchedMovieIds = [];
      }

      if (!user.ratings) {
        user.ratings = {};
      }

      data.favoriteMovieIds.forEach(
        (id) => {
          const movieId =
            Number(id);

          if (
            !user.likedMovieIds.includes(
              movieId
            )
          ) {
            user.likedMovieIds.push(
              movieId
            );
          }

          if (
            !user.watchedMovieIds.includes(
              movieId
            )
          ) {
            user.watchedMovieIds.push(
              movieId
            );
          }

          user.ratings[
            movieId
          ] = 5;
        }
      );
    }

    user.interactionCount =
      Object.keys(
        user.ratings || {}
      ).length +
      user.likedMovieIds.length +
      (user.dislikedMovieIds
        ?.length || 0) +
      user.watchedMovieIds.length;

    user.structuredPreferenceVector =
      this.calculateStructuredPreferenceVector(
        user
      );

    this.users.set(
      user.email.toLowerCase(),
      user
    );

    void this.persistUser(
      user
    );

    return this.sanitizeUser(
      user
    );
  }

  /* =======================================================
     RATING
     ======================================================= */

  public rateMovie(
    userId: string,
    movieId: number,
    rating: number
  ): UserProfile | null {
    const user =
      this.getUserById(
        userId
      );

    if (!user) {
      return null;
    }

    const normalizedMovieId =
      Number(movieId);

    const normalizedRating =
      Math.max(
        1,
        Math.min(
          5,
          Number(rating)
        )
      );

    if (!user.ratings) {
      user.ratings = {};
    }

    if (!user.likedMovieIds) {
      user.likedMovieIds = [];
    }

    if (!user.dislikedMovieIds) {
      user.dislikedMovieIds = [];
    }

    if (!user.watchedMovieIds) {
      user.watchedMovieIds = [];
    }

    user.ratings[
      normalizedMovieId
    ] = normalizedRating;

    if (
      normalizedRating >= 4
    ) {
      if (
        !user.likedMovieIds.includes(
          normalizedMovieId
        )
      ) {
        user.likedMovieIds.push(
          normalizedMovieId
        );
      }

      const index =
        user.dislikedMovieIds.indexOf(
          normalizedMovieId
        );

      if (index > -1) {
        user.dislikedMovieIds.splice(
          index,
          1
        );
      }
    } else if (
      normalizedRating <= 2
    ) {
      if (
        !user.dislikedMovieIds.includes(
          normalizedMovieId
        )
      ) {
        user.dislikedMovieIds.push(
          normalizedMovieId
        );
      }

      const index =
        user.likedMovieIds.indexOf(
          normalizedMovieId
        );

      if (index > -1) {
        user.likedMovieIds.splice(
          index,
          1
        );
      }
    }

    if (
      !user.watchedMovieIds.includes(
        normalizedMovieId
      )
    ) {
      user.watchedMovieIds.push(
        normalizedMovieId
      );
    }

    user.interactionCount =
      Object.keys(
        user.ratings
      ).length +
      user.likedMovieIds.length +
      user.dislikedMovieIds.length +
      user.watchedMovieIds.length;

    user.structuredPreferenceVector =
      this.calculateStructuredPreferenceVector(
        user
      );

    this.users.set(
      user.email.toLowerCase(),
      user
    );

    void this.persistUser(
      user
    );

    return this.sanitizeUser(
      user
    );
  }

  /* =======================================================
     WATCHLIST
     ======================================================= */

  public toggleWatchlist(
    userId: string,
    movieId: number
  ): {
    inWatchlist: boolean;
    user: UserProfile;
  } | null {
    const user =
      this.getUserById(
        userId
      );

    if (!user) {
      return null;
    }

    const normalizedMovieId =
      Number(movieId);

    if (!user.watchlistMovieIds) {
      user.watchlistMovieIds = [];
    }

    const index =
      user.watchlistMovieIds.indexOf(
        normalizedMovieId
      );

    let inWatchlist =
      false;

    if (index > -1) {
      user.watchlistMovieIds.splice(
        index,
        1
      );
    } else {
      user.watchlistMovieIds.push(
        normalizedMovieId
      );

      inWatchlist = true;
    }

    user.structuredPreferenceVector =
      this.calculateStructuredPreferenceVector(
        user
      );

    this.users.set(
      user.email.toLowerCase(),
      user
    );

    void this.persistUser(
      user
    );

    return {
      inWatchlist,

      user:
        this.sanitizeUser(
          user
        ),
    };
  }

  /* =======================================================
     LIKE
     ======================================================= */

  public toggleLike(
    userId: string,
    movieId: number
  ): {
    isLiked: boolean;
    user: UserProfile;
  } | null {
    const user =
      this.getUserById(
        userId
      );

    if (!user) {
      return null;
    }

    const normalizedMovieId =
      Number(movieId);

    if (!user.likedMovieIds) {
      user.likedMovieIds = [];
    }

    if (!user.dislikedMovieIds) {
      user.dislikedMovieIds = [];
    }

    const index =
      user.likedMovieIds.indexOf(
        normalizedMovieId
      );

    let isLiked =
      false;

    if (index > -1) {
      user.likedMovieIds.splice(
        index,
        1
      );
    } else {
      user.likedMovieIds.push(
        normalizedMovieId
      );

      isLiked = true;

      const dislikeIndex =
        user.dislikedMovieIds.indexOf(
          normalizedMovieId
        );

      if (dislikeIndex > -1) {
        user.dislikedMovieIds.splice(
          dislikeIndex,
          1
        );
      }
    }

    user.interactionCount =
      Object.keys(
        user.ratings || {}
      ).length +
      user.likedMovieIds.length +
      user.dislikedMovieIds.length +
      (user.watchedMovieIds
        ?.length || 0);

    user.structuredPreferenceVector =
      this.calculateStructuredPreferenceVector(
        user
      );

    this.users.set(
      user.email.toLowerCase(),
      user
    );

    void this.persistUser(
      user
    );

    return {
      isLiked,

      user:
        this.sanitizeUser(
          user
        ),
    };
  }

  /* =======================================================
     DISLIKE
     ======================================================= */

  public toggleDislike(
    userId: string,
    movieId: number
  ): {
    isDisliked: boolean;
    user: UserProfile;
  } | null {
    const user =
      this.getUserById(
        userId
      );

    if (!user) {
      return null;
    }

    const normalizedMovieId =
      Number(movieId);

    if (!user.dislikedMovieIds) {
      user.dislikedMovieIds = [];
    }

    if (!user.likedMovieIds) {
      user.likedMovieIds = [];
    }

    const index =
      user.dislikedMovieIds.indexOf(
        normalizedMovieId
      );

    let isDisliked =
      false;

    if (index > -1) {
      user.dislikedMovieIds.splice(
        index,
        1
      );
    } else {
      user.dislikedMovieIds.push(
        normalizedMovieId
      );

      isDisliked = true;

      const likeIndex =
        user.likedMovieIds.indexOf(
          normalizedMovieId
        );

      if (likeIndex > -1) {
        user.likedMovieIds.splice(
          likeIndex,
          1
        );
      }
    }

    user.interactionCount =
      Object.keys(
        user.ratings || {}
      ).length +
      user.likedMovieIds.length +
      user.dislikedMovieIds.length +
      (user.watchedMovieIds
        ?.length || 0);

    user.structuredPreferenceVector =
      this.calculateStructuredPreferenceVector(
        user
      );

    this.users.set(
      user.email.toLowerCase(),
      user
    );

    void this.persistUser(
      user
    );

    return {
      isDisliked,

      user:
        this.sanitizeUser(
          user
        ),
    };
  }

  /* =======================================================
     WATCHED
     ======================================================= */

  public toggleWatched(
    userId: string,
    movieId: number
  ): {
    isWatched: boolean;
    user: UserProfile;
  } | null {
    const user =
      this.getUserById(
        userId
      );

    if (!user) {
      return null;
    }

    const normalizedMovieId =
      Number(movieId);

    if (!user.watchedMovieIds) {
      user.watchedMovieIds = [];
    }

    const index =
      user.watchedMovieIds.indexOf(
        normalizedMovieId
      );

    let isWatched =
      false;

    if (index > -1) {
      user.watchedMovieIds.splice(
        index,
        1
      );
    } else {
      user.watchedMovieIds.push(
        normalizedMovieId
      );

      isWatched = true;
    }

    user.interactionCount =
      Object.keys(
        user.ratings || {}
      ).length +
      (user.likedMovieIds
        ?.length || 0) +
      (user.dislikedMovieIds
        ?.length || 0) +
      user.watchedMovieIds.length;

    user.structuredPreferenceVector =
      this.calculateStructuredPreferenceVector(
        user
      );

    this.users.set(
      user.email.toLowerCase(),
      user
    );

    void this.persistUser(
      user
    );

    return {
      isWatched,

      user:
        this.sanitizeUser(
          user
        ),
    };
  }

  /* =======================================================
     REVIEWS
     ======================================================= */

  public addReview(
    review: Omit<
      UserReview,
      'id' | 'createdAt'
    >
  ): UserReview {
    const newReview: UserReview = {
      ...review,

      id: generateId('rev'),

      createdAt:
        new Date().toISOString(),
    };

    this.reviews.unshift(
      newReview
    );

    if (this.mongoEnabled) {
      void ReviewModel.create({
        id: newReview.id,

        userId:
          newReview.userId,

        userName:
          newReview.userName,

        movieId:
          Number(newReview.movieId),

        rating:
          Number(newReview.rating),

        comment:
          newReview.comment || '',

        createdAt:
          new Date(
            newReview.createdAt
          ),
      }).catch((error) => {
        console.error(
          '❌ MongoDB review persistence error:',
          error
        );
      });
    }

    return newReview;
  }

  public getMovieReviews(
    movieId: number
  ): UserReview[] {
    return this.reviews.filter(
      (review) =>
        Number(review.movieId) ===
        Number(movieId)
    );
  }

  /* =======================================================
     HISTORY
     ======================================================= */

  public addHistoryEntry(
    entry: Omit<
      RecommendationHistoryEntry,
      'id' | 'timestamp'
    > & {
      userId?: string;
    }
  ): RecommendationHistoryEntry {
    const newEntry: HistoryWithUser = {
      ...entry,

      id: generateId('hist'),

      timestamp:
        new Date().toISOString(),
    };

    this.history.unshift(
      newEntry
    );

    if (this.mongoEnabled) {
      void HistoryModel.create({
        id: newEntry.id,

        userId:
          newEntry.userId ||
          'unknown',

        selectedMovieIds:
          newEntry.selectedMovieIds ||
          [],

        algorithmUsed:
          newEntry.algorithmUsed ||
          '',

        interactionCountAtTime:
          newEntry.interactionCountAtTime ||
          0,

        recommendationsCount:
          newEntry.recommendationsCount ||
          0,

        topRecommendedMovieTitles:
          newEntry.topRecommendedMovieTitles ||
          [],

        diversityScore:
          newEntry.diversityScore ||
          0,

        timestamp:
          new Date(
            newEntry.timestamp
          ),
      }).catch((error) => {
        console.error(
          '❌ MongoDB history persistence error:',
          error
        );
      });
    }

    return newEntry;
  }

  public getUserHistory(
    userId: string
  ): RecommendationHistoryEntry[] {
    return this.history
      .filter(
        (entry) =>
          entry.userId ===
          userId
      )
      .map(
        (entry) => ({
          id: entry.id,

          selectedMovieIds:
            entry.selectedMovieIds,

          algorithmUsed:
            entry.algorithmUsed,

          interactionCountAtTime:
            entry.interactionCountAtTime,

          recommendationsCount:
            entry.recommendationsCount,

          topRecommendedMovieTitles:
            entry.topRecommendedMovieTitles,

          diversityScore:
            entry.diversityScore,

          timestamp:
            entry.timestamp,
        })
      );
  }

  public getHistory(): RecommendationHistoryEntry[] {
    return this.history.map(
      (entry) => ({
        id: entry.id,

        selectedMovieIds:
          entry.selectedMovieIds,

        algorithmUsed:
          entry.algorithmUsed,

        interactionCountAtTime:
          entry.interactionCountAtTime,

        recommendationsCount:
          entry.recommendationsCount,

        topRecommendedMovieTitles:
          entry.topRecommendedMovieTitles,

        diversityScore:
          entry.diversityScore,

        timestamp:
          entry.timestamp,
      })
    );
  }
}

/* =========================================================
   EXPORT SINGLE DATABASE INSTANCE
   ========================================================= */

export const db =
  new DatabaseStore();