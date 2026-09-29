import dns from 'node:dns';
import mongoose from 'mongoose';

dns.setServers(['1.1.1.1', '8.8.8.8']);

export async function connectMongoDB(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.log('ℹ️ MONGODB_URI not set. Running with high-performance memory store.');
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log('✅ Connected to MongoDB successfully.');
    return true;
  } catch (error) {
    console.warn(
      '⚠️ Could not connect to MongoDB, falling back to local database store:',
      (error as Error).message
    );

    return false;
  }
}

/* =========================================================
   USER MODEL
   ========================================================= */

const UserSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    avatar: {
      type: String,
      default: '',
    },

    interactionCount: {
      type: Number,
      default: 0,
      index: true,
    },

    onboardingCompleted: {
      type: Boolean,
      default: false,
    },

    onboardingPreferences: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    structuredPreferenceVector: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    favoriteGenres: {
      type: [String],
      default: [],
    },

    preferredLanguages: {
      type: [String],
      default: [],
    },

    favoriteActors: {
      type: [String],
      default: [],
    },

    favoriteDirectors: {
      type: [String],
      default: [],
    },

    likedMovieIds: {
      type: [Number],
      default: [],
    },

    dislikedMovieIds: {
      type: [Number],
      default: [],
    },

    watchlistMovieIds: {
      type: [Number],
      default: [],
    },

    watchedMovieIds: {
      type: [Number],
      default: [],
    },

    ratings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    strict: true,
  }
);

export const UserModel =
  mongoose.models.User ||
  mongoose.model('User', UserSchema);

/* =========================================================
   MOVIE MODEL
   ========================================================= */

const MovieSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    overview: {
      type: String,
      default: '',
    },

    poster_path: {
      type: String,
      default: '',
    },

    backdrop_path: {
      type: String,
      default: '',
    },

    vote_average: {
      type: Number,
      default: 0,
    },

    vote_count: {
      type: Number,
      default: 0,
    },

    release_date: {
      type: String,
      default: '',
    },

    popularity: {
      type: Number,
      default: 0,
    },

    runtime: {
      type: Number,
      default: 0,
    },

    language: {
      type: String,
      default: '',
    },

    director: {
      type: String,
      default: '',
    },

    actors: {
      type: [String],
      default: [],
    },

    keywords: {
      type: [String],
      default: [],
    },

    genres: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    moods: {
      type: [String],
      default: [],
    },

    trailer_key: {
      type: String,
      default: undefined,
    },
  },
  {
    strict: true,
  }
);

export const MovieModel =
  mongoose.models.Movie ||
  mongoose.model('Movie', MovieSchema);

/* =========================================================
   REVIEW MODEL
   ========================================================= */

const ReviewSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: String,
      required: true,
      index: true,
    },

    userName: {
      type: String,
      required: true,
    },

    movieId: {
      type: Number,
      required: true,
      index: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      required: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    strict: true,
  }
);

export const ReviewModel =
  mongoose.models.Review ||
  mongoose.model('Review', ReviewSchema);

/* =========================================================
   RECOMMENDATION HISTORY MODEL
   ========================================================= */

const HistorySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    userId: {
      type: String,
      default: 'unknown',
      index: true,
    },

    selectedMovieIds: {
      type: [Number],
      default: [],
    },

    algorithmUsed: {
      type: String,
      default: '',
    },

    interactionCountAtTime: {
      type: Number,
      default: 0,
    },

    recommendationsCount: {
      type: Number,
      default: 0,
    },

    topRecommendedMovieTitles: {
      type: [String],
      default: [],
    },

    diversityScore: {
      type: Number,
      default: 0,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    strict: true,
  }
);

export const HistoryModel =
  mongoose.models.RecommendationHistory ||
  mongoose.model('RecommendationHistory', HistorySchema);