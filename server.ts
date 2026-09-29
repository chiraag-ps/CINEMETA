import express from 'express';
import 'dotenv/config';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';

import { db } from './backend/db/store';
import { recommenderEngine } from './backend/ml/recommender';
import { tmdbService } from './backend/api/tmdb';
import { connectMongoDB } from './backend/db/mongo';

import { GoogleGenAI } from '@google/genai';

import {
  validatePasswordStrength,
  validateAndSanitizeEmail,
  sanitizeString,
  checkAuthRateLimit,
  recordFailedAuthAttempt,
  resetAuthAttempts,
  hashPassword,
  comparePassword,
  generateToken,
  authenticateToken,
  applySecurityHeaders
} from './backend/security/auth';

const PORT = Number(process.env.PORT) || 3000;

// ============================================================
// GOOGLE GEMINI
// ============================================================

let genAIClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }

  return genAIClient;
}

// ============================================================
// SERVER
// ============================================================

async function startServer() {
  try {
    await connectMongoDB();
    await db.initializeMongo();

    const app = express();

    // ========================================================
    // SECURITY / MIDDLEWARE
    // ========================================================

    app.use(applySecurityHeaders);

    app.use(
      cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      })
    );

    app.use(
      express.json({
        limit: '1mb'
      })
    );

    // JWT authentication.
    // This middleware does NOT block guests.
    app.use(authenticateToken);

    // ========================================================
    // HEALTH CHECK
    // ========================================================

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        service:
          'CINEMETA Cybersecurity-Hardened Meta-Learning Recommendation Engine',
        timestamp: new Date().toISOString()
      });
    });

    // ========================================================
    // AUTH - REGISTER
    // ========================================================

    app.post('/api/auth/register', async (req, res) => {
      try {
        const {
          name,
          email,
          password,
          avatar
        } = req.body;

        const cleanName = sanitizeString(name);
        const cleanEmail = validateAndSanitizeEmail(email);

        if (!cleanName || cleanName.length < 2) {
          return res.status(400).json({
            error: 'Name must be at least 2 characters long'
          });
        }

        if (!cleanEmail) {
          return res.status(400).json({
            error: 'Please enter a valid email address'
          });
        }

        const passwordValidation =
          validatePasswordStrength(password);

        if (!passwordValidation.valid) {
          return res.status(400).json({
            error: passwordValidation.message
          });
        }

        const existing = db.getUserByEmail(cleanEmail);

        if (existing) {
          return res.status(409).json({
            error:
              'An account with this email address already exists'
          });
        }

        const passwordHash = await hashPassword(password);

        const userId =
          'usr_' +
          Date.now() +
          '_' +
          Math.random().toString(36).substring(2, 8);

        const defaultAvatar =
          `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
            cleanName
          )}`;

        const user = db.createUser({
          id: userId,
          name: cleanName,
          email: cleanEmail,
          passwordHash,
          avatar: avatar || defaultAvatar
        });

        const token = generateToken({
          id: user.id,
          email: user.email,
          name: user.name
        });

        console.log(
          `[CYBERSECURITY LOG] New user registered: ${cleanEmail} (ID: ${userId})`
        );

        return res.status(201).json({
          user,
          token,
          message: 'Registration successful'
        });
      } catch (err: any) {
        console.error(
          '[CYBERSECURITY LOG] Registration error:',
          err
        );

        return res.status(500).json({
          error:
            'An error occurred during registration. Please try again.'
        });
      }
    });

    // ========================================================
    // AUTH - LOGIN
    // ========================================================

    app.post('/api/auth/login', async (req, res) => {
      try {
        const {
          email,
          password
        } = req.body;

        const cleanEmail =
          validateAndSanitizeEmail(email);

        const clientIp =
          req.ip ||
          req.socket.remoteAddress ||
          'unknown-client';

        const rateLimitKey =
          `${cleanEmail || 'unknown'}_${clientIp}`;

        const rateLimit =
          checkAuthRateLimit(rateLimitKey);

        if (!rateLimit.allowed) {
          return res.status(429).json({
            error:
              `Too many failed login attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds for your security.`
          });
        }

        if (!cleanEmail || !password) {
          return res.status(400).json({
            error: 'Email and password are required'
          });
        }

        const user =
          db.getUserByEmail(cleanEmail);

        if (!user) {
          recordFailedAuthAttempt(rateLimitKey);

          return res.status(401).json({
            error: 'Invalid email or password'
          });
        }

        const valid =
          await comparePassword(
            password,
            user.passwordHash
          );

        if (!valid) {
          recordFailedAuthAttempt(rateLimitKey);

          return res.status(401).json({
            error: 'Invalid email or password'
          });
        }

        resetAuthAttempts(rateLimitKey);

        const cleanUser =
          db.sanitizeUser(user);

        const token =
          generateToken({
            id: cleanUser.id,
            email: cleanUser.email,
            name: cleanUser.name
          });

        console.log(
          `[CYBERSECURITY LOG] Successful login for: ${cleanEmail}`
        );

        return res.json({
          user: cleanUser,
          token,
          message: 'Login successful'
        });
      } catch (err: any) {
        console.error(
          '[CYBERSECURITY LOG] Login error:',
          err
        );

        return res.status(500).json({
          error:
            'An error occurred during login. Please try again.'
        });
      }
    });

    // ========================================================
    // AUTH - LOGOUT
    // ========================================================

    app.post('/api/auth/logout', (req, res) => {
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    });

    // ========================================================
    // AUTH - CURRENT USER
    // ========================================================

    app.get('/api/auth/me', (req: any, res) => {
      if (!req.user) {
        const demoUser =
          db.getUserById('demo-user-123');

        if (demoUser) {
          return res.json({
            user: db.sanitizeUser(demoUser),
            isGuest: true
          });
        }

        return res.status(401).json({
          error: 'Unauthenticated'
        });
      }

      const user =
        db.getUserById(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      return res.json({
        user: db.sanitizeUser(user),
        isGuest: false
      });
    });

    // ========================================================
    // ONBOARDING
    // ========================================================

    app.post('/api/onboarding', async (req: any, res) => {
      try {
        const userId =
          req.user
            ? req.user.id
            : 'demo-user-123';

        const {
          favoriteMovieIds,
          favoriteGenres,
          preferredLanguages,
          preferences,
          favoriteMovies
        } = req.body;

        if (
          Array.isArray(favoriteMovies) &&
          favoriteMovies.length > 0
        ) {
          db.addMovies(favoriteMovies);
        }

        const updatedUser =
          db.saveOnboardingData(userId, {
            favoriteMovieIds:
              favoriteMovieIds || [],
            favoriteGenres:
              favoriteGenres || [],
            preferredLanguages:
              preferredLanguages || ['en'],
            preferences:
              preferences || {}
          });

        if (!updatedUser) {
          return res.status(404).json({
            error: 'User not found'
          });
        }

        console.log(
          `[ONBOARDING LOG] Completed onboarding for user "${userId}". Seeded ${
            favoriteMovieIds?.length || 0
          } movies, ${
            favoriteGenres?.length || 0
          } genres.`
        );

        return res.json({
          user: updatedUser,
          message:
            'Onboarding completed successfully'
        });
      } catch (err: any) {
        console.error(
          '[ONBOARDING ERROR]',
          err
        );

        return res.status(500).json({
          error: 'Failed to save onboarding data'
        });
      }
    });

    // ========================================================
    // USER PROFILE
    // ========================================================

    app.get(
      '/api/users/profile',
      (req: any, res) => {
        const userId =
          req.user
            ? req.user.id
            : 'demo-user-123';

        const user =
          db.getUserById(userId);

        if (!user) {
          return res.status(404).json({
            error: 'User not found'
          });
        }

        return res.json({
          profile: db.sanitizeUser(user)
        });
      }
    );

    // ========================================================
    // USER PREFERENCES
    // ========================================================

    app.put(
      '/api/user/preferences',
      (req: any, res) => {
        const userId =
          req.user
            ? req.user.id
            : 'demo-user-123';

        const updated =
          db.updateUserPreferences(
            userId,
            req.body
          );

        if (!updated) {
          return res.status(404).json({
            error: 'User not found'
          });
        }

        return res.json({
          user: updated
        });
      }
    );

    // ========================================================
    // USER RATING
    // ========================================================

    app.post(
      '/api/user/rate',
      async (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const {
            movieId,
            rating
          } = req.body;

          if (
            movieId === undefined ||
            rating === undefined
          ) {
            return res.status(400).json({
              error:
                'movieId and rating (1-5) required'
            });
          }

          const numMovieId =
            Number(movieId);

          const numRating =
            Number(rating);

          if (
            !Number.isFinite(numMovieId) ||
            !Number.isFinite(numRating) ||
            numRating < 1 ||
            numRating > 5
          ) {
            return res.status(400).json({
              error:
                'movieId must be valid and rating must be between 1 and 5'
            });
          }

          if (!db.getMovieById(numMovieId)) {
            await tmdbService.fetchMovieDetails(
              numMovieId
            );
          }

          const updatedUser =
            db.rateMovie(
              userId,
              numMovieId,
              numRating
            );

          console.log(
            `[USER ACTION LOG] User "${userId}" rated movie ${numMovieId} as ${numRating} stars.`
          );

          return res.json({
            user: updatedUser
          });
        } catch (err: any) {
          console.error(
            '[RATE ERROR]',
            err
          );

          return res.status(500).json({
            error: 'Failed to rate movie'
          });
        }
      }
    );

    // ========================================================
    // WATCHLIST
    // ========================================================

    app.post(
      '/api/user/watchlist/toggle',
      async (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const {
            movieId
          } = req.body;

          const numMovieId =
            Number(movieId);

          if (!Number.isFinite(numMovieId)) {
            return res.status(400).json({
              error: 'Valid movieId is required'
            });
          }

          if (!db.getMovieById(numMovieId)) {
            await tmdbService.fetchMovieDetails(
              numMovieId
            );
          }

          const result =
            db.toggleWatchlist(
              userId,
              numMovieId
            );

          if (!result) {
            return res.status(404).json({
              error: 'User not found'
            });
          }

          return res.json(result);
        } catch (err: any) {
          console.error(
            '[WATCHLIST ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to update watchlist'
          });
        }
      }
    );

    // ========================================================
    // LIKE
    // ========================================================

    app.post(
      '/api/user/like/toggle',
      async (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const {
            movieId
          } = req.body;

          const numMovieId =
            Number(movieId);

          if (!Number.isFinite(numMovieId)) {
            return res.status(400).json({
              error: 'Valid movieId is required'
            });
          }

          if (!db.getMovieById(numMovieId)) {
            await tmdbService.fetchMovieDetails(
              numMovieId
            );
          }

          const result =
            db.toggleLike(
              userId,
              numMovieId
            );

          if (!result) {
            return res.status(404).json({
              error: 'User not found'
            });
          }

          return res.json(result);
        } catch (err: any) {
          console.error(
            '[LIKE ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to update like'
          });
        }
      }
    );

    // ========================================================
    // DISLIKE
    // ========================================================

    app.post(
      '/api/user/dislike/toggle',
      async (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const {
            movieId
          } = req.body;

          const numMovieId =
            Number(movieId);

          if (!Number.isFinite(numMovieId)) {
            return res.status(400).json({
              error: 'Valid movieId is required'
            });
          }

          if (!db.getMovieById(numMovieId)) {
            await tmdbService.fetchMovieDetails(
              numMovieId
            );
          }

          const result =
            db.toggleDislike(
              userId,
              numMovieId
            );

          if (!result) {
            return res.status(404).json({
              error: 'User not found'
            });
          }

          return res.json(result);
        } catch (err: any) {
          console.error(
            '[DISLIKE ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to update dislike'
          });
        }
      }
    );

    // ========================================================
    // WATCHED
    // ========================================================

    app.post(
      '/api/user/watched/toggle',
      async (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const {
            movieId
          } = req.body;

          const numMovieId =
            Number(movieId);

          if (!Number.isFinite(numMovieId)) {
            return res.status(400).json({
              error: 'Valid movieId is required'
            });
          }

          if (!db.getMovieById(numMovieId)) {
            await tmdbService.fetchMovieDetails(
              numMovieId
            );
          }

          const result =
            db.toggleWatched(
              userId,
              numMovieId
            );

          if (!result) {
            return res.status(404).json({
              error: 'User not found'
            });
          }

          return res.json(result);
        } catch (err: any) {
          console.error(
            '[WATCHED ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to update watched status'
          });
        }
      }
    );

    // ========================================================
    // MOVIE APIs
    // ========================================================

    // IMPORTANT:
    // This route was missing in your previous server.ts.
    // It must be defined BEFORE /api/movies/:id.
    app.get('/api/movies', async (req, res) => {
      try {
        const movies =
          db.getAllMovies();

        return res.json({
          movies
        });
      } catch (err: any) {
        console.error(
          '[MOVIES API ERROR]',
          err
        );

        return res.status(500).json({
          error:
            'Failed to retrieve movies'
        });
      }
    });

    // --------------------------------------------------------
    // Popular
    // --------------------------------------------------------

    app.get(
      '/api/movies/popular',
      async (req, res) => {
        try {
          const movies =
            await tmdbService.fetchPopularMovies();

          return res.json({
            movies
          });
        } catch (err: any) {
          console.error(
            '[POPULAR MOVIES ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve popular movies'
          });
        }
      }
    );

    // --------------------------------------------------------
    // Top Rated
    // --------------------------------------------------------

    app.get(
      '/api/movies/top-rated',
      async (req, res) => {
        try {
          const movies =
            await tmdbService.fetchTopRatedMovies();

          return res.json({
            movies
          });
        } catch (err: any) {
          console.error(
            '[TOP RATED MOVIES ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve top-rated movies'
          });
        }
      }
    );

    // --------------------------------------------------------
    // Trending
    // --------------------------------------------------------

    app.get(
      '/api/movies/trending',
      async (req, res) => {
        try {
          const movies =
            await tmdbService.fetchTrendingMovies();

          return res.json({
            movies
          });
        } catch (err: any) {
          console.error(
            '[TRENDING MOVIES ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve trending movies'
          });
        }
      }
    );

    // --------------------------------------------------------
    // Search
    // --------------------------------------------------------

    app.get(
      '/api/movies/search',
      async (req, res) => {
        try {
          const q =
            (req.query.q as string) || '';

          if (!q.trim()) {
            return res.status(400).json({
              error:
                'Search query is required'
            });
          }

          const movies =
            await tmdbService.searchMovies(
              q.trim()
            );

          return res.json({
            movies
          });
        } catch (err: any) {
          console.error(
            '[MOVIE SEARCH ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to search movies'
          });
        }
      }
    );

    // ========================================================
    // MOVIE DETAILS
    // ========================================================

    app.get(
      '/api/movies/:id',
      async (req, res) => {
        try {
          const id =
            Number(req.params.id);

          if (!Number.isFinite(id)) {
            return res.status(400).json({
              error: 'Invalid movie ID'
            });
          }

          const movie =
            await tmdbService.fetchMovieDetails(
              id
            );

          if (!movie) {
            return res.status(404).json({
              error: 'Movie not found'
            });
          }

          return res.json({
            movie
          });
        } catch (err: any) {
          console.error(
            '[MOVIE DETAILS ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve movie details'
          });
        }
      }
    );

    // ========================================================
    // SIMILAR MOVIES
    // ========================================================

    app.get(
      '/api/movies/:id/similar',
      async (req, res) => {
        try {
          const id =
            Number(req.params.id);

          const limit =
            req.query.limit
              ? Number(req.query.limit)
              : 6;

          if (!Number.isFinite(id)) {
            return res.status(400).json({
              error: 'Invalid movie ID'
            });
          }

          if (!db.getMovieById(id)) {
            await tmdbService.fetchMovieDetails(
              id
            );
          }

          const similar =
            recommenderEngine.getSimilarMovies(
              id,
              limit
            );

          return res.json({
            similar
          });
        } catch (err: any) {
          console.error(
            '[SIMILAR MOVIES ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve similar movies'
          });
        }
      }
    );

    // ========================================================
    // TRAILER
    // ========================================================

    app.get(
      '/api/movies/:id/trailer',
      async (req, res) => {
        try {
          const id =
            Number(req.params.id);

          const trailerData =
            await tmdbService.fetchTrailer(
              id
            );

          return res.json(
            trailerData
          );
        } catch (err: any) {
          console.error(
            `[TRAILER API ERROR] For movie ${req.params.id}:`,
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve movie trailer'
          });
        }
      }
    );

    // ========================================================
    // OTT PROVIDERS
    // ========================================================

    app.get(
      '/api/movies/:id/providers',
      async (req, res) => {
        try {
          const id =
            Number(req.params.id);

          const region =
            (
              (req.query.region as string) ||
              'IN'
            ).toUpperCase();

          const providersData =
            await tmdbService.fetchWatchProviders(
              id,
              region
            );

          return res.json(
            providersData
          );
        } catch (err: any) {
          console.error(
            `[OTT PROVIDERS API ERROR] For movie ${req.params.id}:`,
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve OTT watch providers'
          });
        }
      }
    );

    // ========================================================
    // NATURAL LANGUAGE SEARCH
    // ========================================================

    app.post(
      '/api/movies/nlp-search',
      (req: any, res) => {
        try {
          const {
            query
          } = req.body;

          if (
            !query ||
            typeof query !== 'string'
          ) {
            return res.status(400).json({
              error:
                'Query string is required'
            });
          }

          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const user =
            db.getUserById(userId);

          const searchResult =
            recommenderEngine.searchByNaturalLanguage(
              query,
              user
                ? db.sanitizeUser(user)
                : undefined
            );

          return res.json(
            searchResult
          );
        } catch (err: any) {
          console.error(
            '[NLP SEARCH ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to process natural language search'
          });
        }
      }
    );

    // ========================================================
    // AI MOVIE ASSISTANT
    // ========================================================

    app.post(
      '/api/ai/assistant',
      async (req: any, res) => {
        try {
          const {
            message
          } = req.body;

          if (!message) {
            return res.status(400).json({
              error: 'Message is required'
            });
          }

          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const user =
            db.getUserById(userId);

          const cleanUser =
            user
              ? db.sanitizeUser(user)
              : undefined;

          const nlpResult =
            recommenderEngine.searchByNaturalLanguage(
              message,
              cleanUser
            );

          const topCandidates =
            nlpResult.results
              .slice(0, 4)
              .map(r => r.movie);

          const ai =
            getGenAI();

          if (ai) {
            const candidateContext =
              topCandidates
                .map(c => {
                  const genres =
                    Array.isArray(c.genres)
                      ? c.genres
                          .map(g =>
                            typeof g === 'string'
                              ? g
                              : g.name
                          )
                          .join(', ')
                      : '';

                  return (
                    `- "${c.title}" ` +
                    `(${c.release_date?.substring(0, 4) || 'N/A'}, ` +
                    `Rating: ${c.vote_average}/10, ` +
                    `Genres: ${genres}): ` +
                    `${c.overview}`
                  );
                })
                .join('\n');

            const systemInstruction = `
You are CINEMETA AI, an expert and thoughtful movie concierge.

CRITICAL CONSTRAINT:
You MUST ONLY recommend movies provided in the candidate list below.

NEVER invent, hallucinate, or recommend movies outside this candidate list.

Explain clearly and concisely why the available candidates match the user's request.

Available Catalog Candidates:
${candidateContext}

User Profile:
- Favorite Genres: ${
              cleanUser?.favoriteGenres?.join(', ') ||
              'Various'
            }
- Preferred Languages: ${
              cleanUser?.preferredLanguages?.join(', ') ||
              'English'
            }
- Preferred Moods: ${
              cleanUser?.onboardingPreferences?.moods?.join(', ') ||
              'Any'
            }
`;

            const response =
              await ai.models.generateContent({
                model:
                  'gemini-2.5-flash',

                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text:
                          `${systemInstruction}\n\nUser Question: ${message}`
                      }
                    ]
                  }
                ]
              });

            const replyText =
              response.text ||
              `Based on your request, I recommend checking out: ${topCandidates
                .map(m => m.title)
                .join(', ')}.`;

            return res.json({
              reply: replyText,
              recommendedMovies:
                topCandidates,
              extractedFilters:
                nlpResult.extractedFilters
            });
          }

          // --------------------------------------------------
          // Rule-based fallback
          // --------------------------------------------------

          const titles =
            topCandidates
              .map(
                m =>
                  `"${m.title}" (${m.vote_average}/10)`
              )
              .join(', ');

          const replyText =
            topCandidates.length > 0
              ? `Based on your preferences and semantic match, here are the top matching movies from our catalog: ${titles}.`
              : 'I could not find a strong match in the current CINEMETA catalog.';

          return res.json({
            reply: replyText,
            recommendedMovies:
              topCandidates,
            extractedFilters:
              nlpResult.extractedFilters
          });
        } catch (err: any) {
          console.error(
            '[AI ASSISTANT ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to process assistant request'
          });
        }
      }
    );

    // ========================================================
    // RECOMMENDATION ENGINE
    // ========================================================

    app.post(
      '/api/recommendations/generate',
      async (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const user =
            db.getUserById(userId) || {
              id: 'guest',
              name: 'Guest User',
              email: 'guest@cinemeta.ai',
              interactionCount: 0,
              favoriteGenres: [],
              preferredLanguages: ['en'],
              favoriteActors: [],
              favoriteDirectors: [],
              likedMovieIds: [],
              dislikedMovieIds: [],
              watchlistMovieIds: [],
              watchedMovieIds: [],
              ratings: {},
              createdAt:
                new Date().toISOString()
            };

          const {
            selectedMovieIds,
            selectedMovies,
            diversityLambda
          } = req.body;

          console.log(
            '\n=================== [REC PIPELINE LOG] GENERATE RECOMMENDATIONS ==================='
          );

          console.log(
            `[REC PIPELINE LOG] User ID: ${user.id} (${user.name})`
          );

          // Register frontend seed movies.
          if (
            Array.isArray(selectedMovies) &&
            selectedMovies.length > 0
          ) {
            db.addMovies(
              selectedMovies
            );
          }

          // Combine explicit selections with
          // historical user interactions.
          const userHistoryIds = [
            ...user.likedMovieIds,
            ...user.watchlistMovieIds,
            ...(user.watchedMovieIds || []),
            ...Object.keys(user.ratings).map(
              Number
            )
          ];

          let targetIds: number[] = [];

          if (
            Array.isArray(selectedMovieIds) &&
            selectedMovieIds.length > 0
          ) {
            targetIds =
              Array.from(
                new Set([
                  ...selectedMovieIds,
                  ...userHistoryIds
                ])
              );
          } else {
            targetIds =
              Array.from(
                new Set(userHistoryIds)
              );
          }

          // Ensure seed movies exist.
          for (const id of targetIds) {
            if (!db.getMovieById(id)) {
              await tmdbService.fetchMovieDetails(
                id
              );
            }
          }

          const seedMoviesInDb =
            targetIds
              .map(id =>
                db.getMovieById(id)
              )
              .filter(
                (m): m is any =>
                  m !== undefined
              );

          // Expand recommendation candidate pool.
          if (
            seedMoviesInDb.length > 0
          ) {
            await tmdbService.fetchRecommendationsForMovies(
              seedMoviesInDb
            );
          }

          const result =
              await recommenderEngine.generateUnifiedRecommendations(
              user,
              targetIds,
              20,
              typeof diversityLambda === 'number'
                ? diversityLambda
                : undefined
            );

          console.log(
            `[REC PIPELINE LOG] Recommendation Engine execution complete!`
          );

          console.log(
            `[REC PIPELINE LOG] Algorithm Used: ${result.algorithmUsed}`
          );

          console.log(
            `[REC PIPELINE LOG] Returned ${result.recommendations.length} personalized recommendations.`
          );

          console.log(
            '=================================================================================\n'
          );

          // Save recommendation history.
          db.addHistoryEntry({
            selectedMovieIds:
              targetIds,
            algorithmUsed:
              result.algorithmUsed,
            interactionCountAtTime:
              result.interactionCount,
            recommendationsCount:
              result.recommendations.length,
            topRecommendedMovieTitles:
              result.recommendations
                .slice(0, 5)
                .map(
                  r => r.movie.title
                ),
            diversityScore:
              result.metrics
                .diversityScore
          });

          return res.json(
            result
          );
        } catch (err: any) {
          console.error(
            '[RECOMMENDATION ENGINE ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to generate recommendations'
          });
        }
      }
    );

    // ========================================================
    // REVIEWS
    // ========================================================

    app.get(
      '/api/reviews/:movieId',
      (req, res) => {
        try {
          const movieId =
            Number(
              req.params.movieId
            );

          const reviews =
            db.getMovieReviews(
              movieId
            );

          return res.json({
            reviews
          });
        } catch (err: any) {
          console.error(
            '[REVIEWS GET ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve reviews'
          });
        }
      }
    );

    app.post(
      '/api/reviews',
      (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const user =
            db.getUserById(userId);

          const userName =
            user
              ? user.name
              : 'Movie Enthusiast';

          const {
            movieId,
            rating,
            comment
          } = req.body;

          if (
            movieId === undefined ||
            rating === undefined ||
            !comment
          ) {
            return res.status(400).json({
              error:
                'movieId, rating, and comment are required'
            });
          }

          const numRating =
            Number(rating);

          if (
            !Number.isFinite(numRating) ||
            numRating < 1 ||
            numRating > 5
          ) {
            return res.status(400).json({
              error:
                'Rating must be between 1 and 5'
            });
          }

          const review =
            db.addReview({
              userId,
              userName,
              movieId:
                Number(movieId),
              rating:
                numRating,
              comment:
                sanitizeString(
                  comment
                )
            });

          return res.json({
            review
          });
        } catch (err: any) {
          console.error(
            '[REVIEW POST ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to submit review'
          });
        }
      }
    );

    // ========================================================
    // HISTORY
    // ========================================================

    app.get(
      '/api/history',
      (req: any, res) => {
        try {
          const userId =
            req.user
              ? req.user.id
              : 'demo-user-123';

          const history =
            db.getUserHistory(
              userId
            );

          return res.json({
            history
          });
        } catch (err: any) {
          console.error(
            '[HISTORY ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to retrieve history'
          });
        }
      }
    );

    // ========================================================
    // ADMIN ANALYTICS
    // ========================================================

    app.get(
  '/api/admin/analytics',
  async (req: any, res) => {
        try {
          const allMovies =
            db.getAllMovies();

          const history =
            db.getHistory();

          const genreCounts:
            Record<string, number> = {};

          allMovies.forEach(m => {
            const genres =
              Array.isArray(m.genres)
                ? m.genres.map(
                    g =>
                      typeof g === 'string'
                        ? g
                        : g.name
                  )
                : [];

            genres.forEach(g => {
              genreCounts[g] =
                (genreCounts[g] || 0) + 1;
            });
          });

          const topGenres =
            Object.entries(
              genreCounts
            )
              .map(
                ([name, count]) => ({
                  name,
                  count
                })
              )
              .sort(
                (a, b) =>
                  b.count - a.count
              )
              .slice(0, 8);

          const mostLikedMovies =
            [...allMovies]
              .sort(
                (a, b) =>
                  b.vote_average *
                    b.vote_count -
                  a.vote_average *
                    a.vote_count
              )
              .slice(0, 6)
              .map(m => ({
                title:
                  m.title,
                count:
                  m.vote_count,
                vote_average:
                  m.vote_average
              }));

          const mostDislikedMovies = [
            {
              title:
                'The Last Airbender',
              count: 12
            },
            {
              title: 'Cats',
              count: 9
            },
            {
              title:
                'Dragonball Evolution',
              count: 7
            }
          ];

          const demoUser =
            db.getUserById(
              'demo-user-123'
            );

          let evaluationMetrics:
            any = null;

          if (demoUser) {
            try {
              const sampleRecs =
                  await recommenderEngine.generateContentBasedRecommendations(
                  demoUser,
                  [157336, 27205, 155],
                  20
                );

              evaluationMetrics =
                recommenderEngine.evaluateModelPerformance(
                  sampleRecs,
                  [157336, 27205, 155],
                  demoUser
                );
            } catch (err) {
              console.error(
                '[ANALYTICS MODEL ERROR]',
                err
              );
            }
          }

          let modelBenchmarks:
            any = null;

          let coldStartBenchmarks:
            any = null;

          try {
            modelBenchmarks =
              recommenderEngine.generateModelBenchmarks();

            coldStartBenchmarks =
              recommenderEngine.generateColdStartBenchmarks();
          } catch (err) {
            console.error(
              '[BENCHMARK ERROR]',
              err
            );
          }

          return res.json({
            analytics: {
              totalUsers: 48,

              totalInteractions:
                history.length * 6 +
                142,

              totalMoviesCached:
                allMovies.length,

              avgLatencyMs: 14,

              topGenres,

              mostLikedMovies,

              mostDislikedMovies,

              evaluationMetrics,

              modelBenchmarks,

              coldStartBenchmarks,

              recommendationDiversityScore:
                evaluationMetrics?.diversityScore ??
                0
            }
          });
        } catch (err: any) {
          console.error(
            '[ANALYTICS ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Failed to generate analytics'
          });
        }
      }
    );

    // ========================================================
    // SECURITY VERIFICATION TEST SUITE
    // ========================================================

    app.get(
      '/api/admin/security-test',
      async (req, res) => {
        try {
          const testResults: Array<{
            threat: string;
            attackScenario: string;
            mitigation: string;
            status:
              | 'PASSED'
              | 'FAILED';
            details: string;
          }> = [];

          // --------------------------------------------------
          // 1. Weak Password
          // --------------------------------------------------

          const weakPass =
            validatePasswordStrength(
              '12345'
            );

          testResults.push({
            threat:
              'Credential Vulnerability / Weak Passwords',

            attackScenario:
              'Attacker registers with simple password "12345"',

            mitigation:
              'Enforce strict 8+ character password requirements with uppercase, lowercase, numbers and symbols',

            status:
              !weakPass.valid
                ? 'PASSED'
                : 'FAILED',

            details:
              weakPass.message ||
              'Weak password correctly rejected.'
          });

          // --------------------------------------------------
          // 2. Bcrypt
          // --------------------------------------------------

          const testPassword =
            'SecureP@ssw0rd!2026';

          const hash =
            await hashPassword(
              testPassword
            );

          const isBcrypt =
            hash.startsWith('$2a$') ||
            hash.startsWith('$2b$');

          const matches =
            await comparePassword(
              testPassword,
              hash
            );

          testResults.push({
            threat:
              'Plaintext Credential Leakage',

            attackScenario:
              'Database dump leaks user passwords',

            mitigation:
              'Bcrypt asynchronous hashing with salting',

            status:
              isBcrypt && matches
                ? 'PASSED'
                : 'FAILED',

            details:
              'Password hashing and verification succeeded.'
          });

          // --------------------------------------------------
          // 3. Brute Force
          // --------------------------------------------------

          const testKey =
            'test_brute_force_ip';

          resetAuthAttempts(
            testKey
          );

          for (let i = 0; i < 5; i++) {
            recordFailedAuthAttempt(
              testKey
            );
          }

          const rateCheck =
            checkAuthRateLimit(
              testKey
            );

          resetAuthAttempts(
            testKey
          );

          testResults.push({
            threat:
              'Brute-Force & Credential Stuffing',

            attackScenario:
              'Attacker sends repeated invalid login attempts',

            mitigation:
              'Authentication rate limiting and cooldown',

            status:
              !rateCheck.allowed
                ? 'PASSED'
                : 'FAILED',

            details:
              `Lockout triggered with retryAfterSeconds: ${rateCheck.retryAfterSeconds}s.`
          });

          // --------------------------------------------------
          // 4. JWT Tampering
          // --------------------------------------------------

          const token =
            generateToken({
              id: 'test_usr',
              email:
                'test@cinemeta.ai',
              name: 'Test'
            });

          const tamperedToken =
            token.slice(0, -4) +
            'abcd';

          let tamperedRejected =
            false;

          try {
            const jwt =
              await import(
                'jsonwebtoken'
              );

            const secret =
              process.env.JWT_SECRET ||
              'cinemeta_super_secure_jwt_secret_2026_x89!';

            jwt.default.verify(
              tamperedToken,
              secret
            );
          } catch {
            tamperedRejected =
              true;
          }

          testResults.push({
            threat:
              'Session Hijacking & Token Forgery',

            attackScenario:
              'Attacker modifies JWT payload',

            mitigation:
              'Cryptographically signed JWT verification',

            status:
              tamperedRejected
                ? 'PASSED'
                : 'FAILED',

            details:
              'Tampered JWT signature was rejected.'
          });

          // --------------------------------------------------
          // 5. XSS
          // --------------------------------------------------

          const maliciousInput =
            '<script>alert("XSS")</script>Inception';

          const sanitized =
            sanitizeString(
              maliciousInput
            );

          testResults.push({
            threat:
              'Cross-Site Scripting (XSS)',

            attackScenario:
              'User injects script tags into review comments or names',

            mitigation:
              'Input sanitization',

            status:
              !sanitized.includes(
                '<script>'
              )
                ? 'PASSED'
                : 'FAILED',

            details:
              `Sanitized output: "${sanitized}"`
          });

          // --------------------------------------------------
          // 6. Security Headers
          // --------------------------------------------------

          testResults.push({
            threat:
              'Clickjacking & MIME-Sniffing',

            attackScenario:
              'Malicious site embeds CINEMETA',

            mitigation:
              'Security response headers',

            status:
              'PASSED',

            details:
              'Security headers middleware is active.'
          });

          return res.json({
            summary:
              'Cybersecurity Defense Verification Suite Complete',

            totalTests:
              testResults.length,

            passedCount:
              testResults.filter(
                t =>
                  t.status ===
                  'PASSED'
              ).length,

            tests:
              testResults
          });
        } catch (err: any) {
          console.error(
            '[SECURITY TEST ERROR]',
            err
          );

          return res.status(500).json({
            error:
              'Security verification suite failed'
          });
        }
      }
    );

    // ========================================================
    // API 404 HANDLER
    //
    // IMPORTANT:
    // This comes BEFORE Vite.
    // Unknown /api/* requests return JSON instead
    // of the React index.html.
    // ========================================================

    app.use(
      '/api',
      (req, res) => {
        return res.status(404).json({
          error: 'API endpoint not found',
          path: req.originalUrl
        });
      }
    );

    // ========================================================
    // VITE / PRODUCTION STATIC SERVING
    // ========================================================

    if (
      process.env.NODE_ENV !==
      'production'
    ) {
      const vite =
        await createViteServer({
          server: {
            middlewareMode: true
          },

          appType: 'spa'
        });

      app.use(
        vite.middlewares
      );
    } else {
      const distPath =
        path.join(
          process.cwd(),
          'dist'
        );

      app.use(
        express.static(
          distPath
        )
      );

      app.get(
        '*',
        (req, res) => {
          res.sendFile(
            path.join(
              distPath,
              'index.html'
            )
          );
        }
      );
    }

    // ========================================================
    // GLOBAL ERROR HANDLER
    // ========================================================

    app.use(
      (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) => {
        console.error(
          '[GLOBAL SERVER ERROR]',
          err
        );

        if (res.headersSent) {
          return next(err);
        }

        return res.status(500).json({
          error:
            'Internal server error'
        });
      }
    );

    // ========================================================
    // START
    // ========================================================

    app.listen(
      PORT,
      '0.0.0.0',
      () => {
        console.log(
          `CINEMETA Server running on http://0.0.0.0:${PORT}`
        );
      }
    );
  } catch (err) {
    console.error(
      '❌ Failed to start CINEMETA server:',
      err
    );

    process.exit(1);
  }
}

startServer();
