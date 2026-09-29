import { Movie } from '../../src/types';
import { db } from '../db/store';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export class TMDbService {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY;
  }

  private get headers() {
    return {
      'Accept': 'application/json'
    };
  }

  private async fetchWithRetry(
    url: string,
    retries = 3
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          headers: this.headers,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.status >= 500 && attempt < retries) {
          await new Promise(resolve =>
            setTimeout(resolve, 1000 * attempt)
          );
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        if (attempt < retries) {
          await new Promise(resolve =>
            setTimeout(resolve, 1000 * attempt)
          );
        }
      }
    }

    throw lastError ?? new Error('TMDB request failed');
  }

  public async fetchPopularMovies(): Promise<Movie[]> {
    if (!this.apiKey) {
      return db.getAllMovies().sort((a, b) => b.popularity - a.popularity);
    }

    try {
      const res = await fetch(`${TMDB_BASE_URL}/movie/popular?api_key=${this.apiKey}&language=en-US&page=1`, { headers: this.headers });
      if (!res.ok) throw new Error(`TMDb error ${res.status}`);
      const data = await res.json();
      const movies = this.formatTMDbMovies(data.results || []);
      db.addMovies(movies);
      return movies;
    } catch (err) {
      console.warn('Falling back to local cached dataset for popular movies:', err);
      return db.getAllMovies().sort((a, b) => b.popularity - a.popularity);
    }
  }

  public async fetchTopRatedMovies(): Promise<Movie[]> {
    if (!this.apiKey) {
      return db.getAllMovies().sort((a, b) => b.vote_average - a.vote_average);
    }

    try {
      const res = await fetch(`${TMDB_BASE_URL}/movie/top_rated?api_key=${this.apiKey}&language=en-US&page=1`, { headers: this.headers });
      if (!res.ok) throw new Error(`TMDb error ${res.status}`);
      const data = await res.json();
      const movies = this.formatTMDbMovies(data.results || []);
      db.addMovies(movies);
      return movies;
    } catch (err) {
      return db.getAllMovies().sort((a, b) => b.vote_average - a.vote_average);
    }
  }

  public async fetchTrendingMovies(): Promise<Movie[]> {
    if (!this.apiKey) {
      return db.getAllMovies();
    }

    try {
      const res = await fetch(`${TMDB_BASE_URL}/trending/movie/week?api_key=${this.apiKey}`, { headers: this.headers });
      if (!res.ok) throw new Error(`TMDb error ${res.status}`);
      const data = await res.json();
      const movies = this.formatTMDbMovies(data.results || []);
      db.addMovies(movies);
      return movies;
    } catch (err) {
      return db.getAllMovies();
    }
  }

  public async fetchRecommendationsForMovies(seedMovies: Movie[]): Promise<Movie[]> {
    if (!this.apiKey || seedMovies.length === 0) {
      console.log(`[TMDB PIPELINE LOG] TMDb API key missing or empty seed list. Relying on local catalog of ${db.getAllMovies().length} movies.`);
      return db.getAllMovies();
    }

    const fetchedMovies: Movie[] = [];
    console.log(`[TMDB PIPELINE LOG] Expanding candidates from TMDb for ${seedMovies.length} seed movies...`);

    for (const seed of seedMovies.slice(0, 5)) {
      try {
        console.log(`[TMDB PIPELINE LOG] Fetching TMDb recommendations & similar for seed movie "${seed.title}" (ID: ${seed.id}, Lang: ${seed.language})...`);
        const res = await fetch(`${TMDB_BASE_URL}/movie/${seed.id}/recommendations?api_key=${this.apiKey}&language=en-US&page=1`, { headers: this.headers });
        if (res.ok) {
          const data = await res.json();
          const recs = this.formatTMDbMovies(data.results || []);
          fetchedMovies.push(...recs);
        }

        // Also fetch similar movies for additional candidate depth
        const simRes = await fetch(`${TMDB_BASE_URL}/movie/${seed.id}/similar?api_key=${this.apiKey}&language=en-US&page=1`, { headers: this.headers });
        if (simRes.ok) {
          const simData = await simRes.json();
          const sims = this.formatTMDbMovies(simData.results || []);
          fetchedMovies.push(...sims);
        }

        // Discover movies in the seed's original language if non-English
        const seedLang = seed.language ? seed.language.toLowerCase() : 'en';
        if (seedLang !== 'en') {
          console.log(`[TMDB PIPELINE LOG] Discovering top TMDb movies for original language "${seedLang}"...`);
          const discRes = await fetch(`${TMDB_BASE_URL}/discover/movie?api_key=${this.apiKey}&with_original_language=${seedLang}&sort_by=popularity.desc&page=1`, { headers: this.headers });
          if (discRes.ok) {
            const discData = await discRes.json();
            const discMovies = this.formatTMDbMovies(discData.results || []);
            fetchedMovies.push(...discMovies);
          }
        }
      } catch (err) {
        console.warn(`[TMDB PIPELINE LOG] Failed to fetch TMDb recommendations for seed ${seed.id}:`, err);
      }
    }

    if (fetchedMovies.length > 0) {
      db.addMovies(fetchedMovies);
      console.log(`[TMDB PIPELINE LOG] Successfully expanded dataset by adding ${fetchedMovies.length} candidates. Total catalog size: ${db.getAllMovies().length} movies.`);
    }

    return db.getAllMovies();
  }

    public async fetchColdStartCandidates(
    user?: import('../../src/types').UserProfile
  ): Promise<Movie[]> {
    if (!this.apiKey) {
      console.log(
        `[TMDB PIPELINE LOG] Cold-start discovery skipped: TMDb API key unavailable.`
      );
      return db.getAllMovies();
    }

    try {
      const preferences = user?.onboardingPreferences || {};

      const preferredLanguage =
        user?.preferredLanguages?.[0] || 'en';

      const minRating =
        typeof preferences.minRating === 'number'
          ? preferences.minRating
          : 0;

      const maxRuntime =
        typeof preferences.maxRuntime === 'number'
          ? preferences.maxRuntime
          : undefined;

      const params = new URLSearchParams({
        api_key: this.apiKey,
        language: 'en-US',
        sort_by: 'popularity.desc',
        page: '1',
        with_original_language: preferredLanguage
      });

      if (minRating > 0) {
        params.set(
          'vote_average.gte',
          String(minRating)
        );
      }

      if (maxRuntime) {
        params.set(
          'with_runtime.lte',
          String(maxRuntime)
        );
      }

      console.log(
        `[TMDB PIPELINE LOG] Cold-start discovery: language=${preferredLanguage}, minRating=${minRating}, maxRuntime=${maxRuntime ?? 'any'}`
      );

      const res = await fetch(
        `${TMDB_BASE_URL}/discover/movie?${params.toString()}`,
        {
          headers: this.headers
        }
      );

      if (!res.ok) {
        console.warn(
          `[TMDB PIPELINE LOG] Cold-start discovery failed with status ${res.status}.`
        );
        return db.getAllMovies();
      }

      const data = await res.json();

      const movies =
        this.formatTMDbMovies(
          data.results || []
        );

      if (movies.length > 0) {
        db.addMovies(movies);

        console.log(
          `[TMDB PIPELINE LOG] Cold-start discovery added ${movies.length} TMDb candidates. Total catalog: ${db.getAllMovies().length}`
        );
      }

      return db.getAllMovies();
    } catch (err) {
      console.warn(
        `[TMDB PIPELINE LOG] Cold-start discovery failed:`,
        err
      );

      return db.getAllMovies();
    }
  }


  /**
   * Live TMDB discovery for the AI assistant.
   * Uses TMDB filters instead of relying only on the local cache.
   */
  public async discoverAssistantMovies(options: {
    language?: string;
    genres?: string[];
    minRating?: number;
    maxRuntime?: number;
    limit?: number;
  }): Promise<Movie[]> {
    if (!this.apiKey) {
      console.warn(
        '[TMDB ASSISTANT] TMDB_API_KEY is not configured. Live discovery is unavailable.'
      );
      return [];
    }

    const genreIds: Record<string, number> = {
      Action: 28,
      Adventure: 12,
      Animation: 16,
      Comedy: 35,
      Crime: 80,
      Documentary: 99,
      Drama: 18,
      Fantasy: 14,
      Horror: 27,
      Mystery: 9648,
      Romance: 10749,
      'Sci-Fi': 878,
      Thriller: 53
    };

    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        language: 'en-US',
        sort_by: 'popularity.desc',
        page: '1',
        include_adult: 'false',
        include_video: 'false'
      });

      if (options.language) {
        params.set(
          'with_original_language',
          options.language
        );
      }

      const requestedGenreIds = (options.genres || [])
        .map(genre => genreIds[genre])
        .filter((id): id is number => Number.isFinite(id));

      if (requestedGenreIds.length > 0) {
        // Comma-separated TMDB genre IDs require all requested genres.
        params.set(
          'with_genres',
          requestedGenreIds.join(',')
        );
      }

      if (typeof options.minRating === 'number' && options.minRating > 0) {
        params.set(
          'vote_average.gte',
          String(options.minRating)
        );
      }

      if (typeof options.maxRuntime === 'number' && options.maxRuntime > 0) {
        params.set(
          'with_runtime.lte',
          String(options.maxRuntime)
        );
      }

      console.log(
        `[TMDB ASSISTANT] Live discovery: language=${options.language || 'any'}, genres=${options.genres?.join(', ') || 'any'}, minRating=${options.minRating ?? 'any'}, maxRuntime=${options.maxRuntime ?? 'any'}`
      );

      const res = await this.fetchWithRetry(
        `${TMDB_BASE_URL}/discover/movie?${params.toString()}`
      );

      if (!res.ok) {
        console.warn(
          `[TMDB ASSISTANT] Discovery failed with status ${res.status}`
        );
        return [];
      }

      const data = await res.json();
      const movies = this
        .formatTMDbMovies(data.results || [])
        .filter(movie => Boolean(movie.poster_path));

      if (movies.length > 0) {
        db.addMovies(movies);
      }

      return movies.slice(0, options.limit || 8);
    } catch (error) {
      console.warn(
        '[TMDB ASSISTANT] Live discovery error:',
        error
      );
      return [];
    }
  }

  public async searchMovies(query: string): Promise<Movie[]> {
    if (!query) return [];
    
    // First search in local DB
    const localMatches = db.getAllMovies().filter(m =>
      m.title.toLowerCase().includes(query.toLowerCase()) ||
      (m.director && m.director.toLowerCase().includes(query.toLowerCase())) ||
      (m.actors && m.actors.some(a => a.toLowerCase().includes(query.toLowerCase())))
    );

    if (!this.apiKey) {
      return localMatches;
    }

    try {
      const res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=en-US`, { headers: this.headers });
      if (!res.ok) return localMatches;
      const data = await res.json();
      const apiMovies = this.formatTMDbMovies(data.results || []);
      db.addMovies(apiMovies);

      // Merge results uniquely
      const combined = [...localMatches];
      apiMovies.forEach(m => {
        if (!combined.some(c => c.id === m.id)) {
          combined.push(m);
        }
      });
      return combined;
    } catch (err) {
      return localMatches;
    }
  }

  public async fetchMovieDetails(movieId: number): Promise<Movie | null> {
    const cached = db.getMovieById(movieId);
    const hasValidTrailer = cached?.trailer_key && (movieId === 27205 || cached.trailer_key !== 'YoHD9XEInc0');
    
    if (cached && hasValidTrailer && cached.actors && cached.actors.length > 0 && cached.director && cached.director !== "Renowned Director") {
      return cached;
    }

    if (!this.apiKey) {
      return cached || null;
    }

    try {
      const res = await fetch(`${TMDB_BASE_URL}/movie/${movieId}?api_key=${this.apiKey}&append_to_response=credits,videos,keywords`, { headers: this.headers });
      if (!res.ok) return cached || null;
      const data = await res.json();
      
      const formatted = this.formatSingleTMDbMovie(data);
      db.addOrUpdateMovie(formatted);
      return db.getMovieById(movieId) || formatted;
    } catch (err) {
      return cached || null;
    }
  }

  private formatTMDbMovies(rawList: any[]): Movie[] {
    return rawList.map(raw => this.formatSingleTMDbMovie(raw));
  }

  private formatSingleTMDbMovie(raw: any): Movie {
    const genresList = raw.genres
      ? raw.genres.map((g: any) => typeof g === 'string' ? g : g.name)
      : [];

    let trailerKey = raw.trailer_key;
    if (!trailerKey && raw.videos?.results && Array.isArray(raw.videos.results)) {
      const trailerObj = raw.videos.results.find((v: any) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Clip')) ||
                         raw.videos.results.find((v: any) => v.site === 'YouTube');
      if (trailerObj) trailerKey = trailerObj.key;
    }

    // Check cached version in store to preserve existing valid trailer_key
    const cached = db.getMovieById(raw.id);
    if (!trailerKey && cached?.trailer_key && (raw.id === 27205 || cached.trailer_key !== 'YoHD9XEInc0')) {
      trailerKey = cached.trailer_key;
    }

    let director = raw.director;
    let actors: string[] = raw.actors || [];
    if (raw.credits) {
      if (!director && raw.credits.crew) {
        const dirObj = raw.credits.crew.find((c: any) => c.job === 'Director');
        if (dirObj) director = dirObj.name;
      }
      if (actors.length === 0 && raw.credits.cast) {
        actors = raw.credits.cast.slice(0, 5).map((c: any) => c.name);
      }
    }

    return {
      id: raw.id,
      title: raw.title || raw.original_title || "Untitled Movie",
      overview: raw.overview || "No description available.",
      poster_path: raw.poster_path || "",
      backdrop_path: raw.backdrop_path || "",
      release_date: raw.release_date || "2024-01-01",
      vote_average: raw.vote_average || 7.5,
      vote_count: raw.vote_count || 1000,
      popularity: raw.popularity || 100,
      runtime: raw.runtime || 120,
      genres: genresList.length > 0 ? genresList : ["Drama", "Action"],
      director: director || (cached?.director && cached.director !== "Renowned Director" ? cached.director : "Renowned Director"),
      actors: actors.length > 0 ? actors : (cached?.actors || ["Featured Cast"]),
      language: raw.original_language || "en",
      budget: raw.budget || 50000000,
      revenue: raw.revenue || 150000000,
      trailer_key: trailerKey || (raw.id === 27205 ? 'YoHD9XEInc0' : undefined),
      tagline: raw.tagline || ""
    };
  }
  public async fetchWatchProviders(movieId: number, targetRegion: string = 'IN'): Promise<{
    movieId: number;
    movieTitle: string;
    region: string;
    providers: Array<{ name: string; logo: string; type: 'subscription' | 'free' | 'rent' | 'buy'; url: string; isDeepLink: boolean }>;
    tmdbWatchLink?: string;
    hasDirectDeepLinks: boolean;
  }> {
    const movie = await this.fetchMovieDetails(movieId) || db.getMovieById(movieId);
    const movieTitle = movie ? movie.title : 'Movie';

    // Provider Deep Link Generator Helper
    const generateDeepLink = (providerName: string, title: string): { url: string; isDeepLink: boolean } => {
      const pName = providerName.toLowerCase();
      const enc = encodeURIComponent(title);

      if (pName.includes('netflix')) {
        return { url: `https://www.netflix.com/search?q=${enc}`, isDeepLink: true };
      }
      if (pName.includes('prime') || pName.includes('amazon')) {
        return { url: `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${enc}`, isDeepLink: true };
      }
      if (pName.includes('hotstar') || pName.includes('disney')) {
        return { url: `https://www.hotstar.com/in/search?q=${enc}`, isDeepLink: true };
      }
      if (pName.includes('apple') || pName.includes('itunes')) {
        return { url: `https://tv.apple.com/search?term=${enc}`, isDeepLink: true };
      }
      if (pName.includes('zee5')) {
        return { url: `https://www.zee5.com/search?q=${enc}`, isDeepLink: true };
      }
      if (pName.includes('sony') || pName.includes('liv')) {
        return { url: `https://www.sonyliv.com/search?q=${enc}`, isDeepLink: true };
      }
      if (pName.includes('youtube')) {
        return { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' movie')}`, isDeepLink: true };
      }
      if (pName.includes('google')) {
        return { url: `https://play.google.com/store/search?q=${enc}&c=movies`, isDeepLink: true };
      }
      if (pName.includes('jiocinema') || pName.includes('jio')) {
        return { url: `https://www.jiocinema.com/search/${enc}`, isDeepLink: true };
      }
      if (pName.includes('hulu')) {
        return { url: `https://www.hulu.com/search?q=${enc}`, isDeepLink: true };
      }
      if (pName.includes('max') || pName.includes('hbo')) {
        return { url: `https://www.max.com/search?q=${enc}`, isDeepLink: true };
      }
      return { url: `https://www.google.com/search?q=${encodeURIComponent('watch ' + title + ' online on ' + providerName)}`, isDeepLink: false };
    };

    if (!this.apiKey) {
      // Return high-quality curated streaming availability based on language/popularity
      const defaultProviders = [];
      const lang = movie?.language || 'en';

      if (lang === 'kn' || lang === 'te' || lang === 'ta' || lang === 'ml' || lang === 'hi') {
        defaultProviders.push(
          {
            name: 'Amazon Prime Video',
            logo: 'https://image.tmdb.org/t/p/original/emthp39XA2zhcoYLKJsd3vTGQzV.jpg',
            type: 'subscription' as const,
            ...generateDeepLink('Amazon Prime Video', movieTitle)
          },
          {
            name: 'JioHotstar',
            logo: 'https://image.tmdb.org/t/p/original/7rwgEs15tFwyR9NPQ5vpzxTj19Q.jpg',
            type: 'subscription' as const,
            ...generateDeepLink('Hotstar', movieTitle)
          },
          {
            name: 'Netflix',
            logo: 'https://image.tmdb.org/t/p/original/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
            type: 'subscription' as const,
            ...generateDeepLink('Netflix', movieTitle)
          },
          {
            name: 'YouTube Movies',
            logo: 'https://image.tmdb.org/t/p/original/peURlLlr8jggOwK53fJ5wdQl05y.jpg',
            type: 'rent' as const,
            ...generateDeepLink('YouTube Movies', movieTitle)
          }
        );
      } else {
        defaultProviders.push(
          {
            name: 'Netflix',
            logo: 'https://image.tmdb.org/t/p/original/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
            type: 'subscription' as const,
            ...generateDeepLink('Netflix', movieTitle)
          },
          {
            name: 'Amazon Prime Video',
            logo: 'https://image.tmdb.org/t/p/original/emthp39XA2zhcoYLKJsd3vTGQzV.jpg',
            type: 'subscription' as const,
            ...generateDeepLink('Amazon Prime Video', movieTitle)
          },
          {
            name: 'Apple TV',
            logo: 'https://image.tmdb.org/t/p/original/q6tl6Ib6X5FT80TSuIjQioio4Cr.jpg',
            type: 'rent' as const,
            ...generateDeepLink('Apple TV', movieTitle)
          }
        );
      }

      return {
        movieId,
        movieTitle,
        region: targetRegion,
        providers: defaultProviders,
        tmdbWatchLink: `https://www.themoviedb.org/movie/${movieId}/watch`,
        hasDirectDeepLinks: true
      };
    }

    try {
      const res = await fetch(`${TMDB_BASE_URL}/movie/${movieId}/watch/providers?api_key=${this.apiKey}`, { headers: this.headers });
      if (!res.ok) throw new Error(`TMDb watch providers error: ${res.status}`);
      const data = await res.json();
      const results = data.results || {};

      // Check target region (e.g. IN), then fallback to US, then any available region
      const regionData = results[targetRegion] || results['US'] || results['GB'] || Object.values(results)[0] as any;

      const providersList: Array<{ name: string; logo: string; type: 'subscription' | 'free' | 'rent' | 'buy'; url: string; isDeepLink: boolean }> = [];
      const seenNames = new Set<string>();

      if (regionData) {
        // Flatrate / Subscription
        if (Array.isArray(regionData.flatrate)) {
          regionData.flatrate.forEach((p: any) => {
            if (!seenNames.has(p.provider_name)) {
              seenNames.add(p.provider_name);
              const deep = generateDeepLink(p.provider_name, movieTitle);
              providersList.push({
                name: p.provider_name,
                logo: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : '',
                type: 'subscription',
                url: deep.url,
                isDeepLink: deep.isDeepLink
              });
            }
          });
        }

        // Free with ads
        if (Array.isArray(regionData.free)) {
          regionData.free.forEach((p: any) => {
            if (!seenNames.has(p.provider_name)) {
              seenNames.add(p.provider_name);
              const deep = generateDeepLink(p.provider_name, movieTitle);
              providersList.push({
                name: p.provider_name,
                logo: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : '',
                type: 'free',
                url: deep.url,
                isDeepLink: deep.isDeepLink
              });
            }
          });
        }

        // Rent
        if (Array.isArray(regionData.rent)) {
          regionData.rent.slice(0, 3).forEach((p: any) => {
            if (!seenNames.has(p.provider_name)) {
              seenNames.add(p.provider_name);
              const deep = generateDeepLink(p.provider_name, movieTitle);
              providersList.push({
                name: p.provider_name,
                logo: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : '',
                type: 'rent',
                url: deep.url,
                isDeepLink: deep.isDeepLink
              });
            }
          });
        }

        // Buy
        if (Array.isArray(regionData.buy)) {
          regionData.buy.slice(0, 2).forEach((p: any) => {
            if (!seenNames.has(p.provider_name)) {
              seenNames.add(p.provider_name);
              const deep = generateDeepLink(p.provider_name, movieTitle);
              providersList.push({
                name: p.provider_name,
                logo: p.logo_path ? `https://image.tmdb.org/t/p/original${p.logo_path}` : '',
                type: 'buy',
                url: deep.url,
                isDeepLink: deep.isDeepLink
              });
            }
          });
        }
      }

      // Fallback if TMDb returned no providers for region
      if (providersList.length === 0) {
        providersList.push(
          {
            name: 'Amazon Prime Video',
            logo: 'https://image.tmdb.org/t/p/original/emthp39XA2zhcoYLKJsd3vTGQzV.jpg',
            type: 'subscription',
            ...generateDeepLink('Amazon Prime Video', movieTitle)
          },
          {
            name: 'YouTube Movies',
            logo: 'https://image.tmdb.org/t/p/original/peURlLlr8jggOwK53fJ5wdQl05y.jpg',
            type: 'rent',
            ...generateDeepLink('YouTube Movies', movieTitle)
          }
        );
      }

      return {
        movieId,
        movieTitle,
        region: regionData ? targetRegion : 'Global',
        providers: providersList,
        tmdbWatchLink: regionData?.link || `https://www.themoviedb.org/movie/${movieId}/watch`,
        hasDirectDeepLinks: true
      };
    } catch (err) {
      console.warn(`[TMDB PIPELINE LOG] Error fetching watch providers for movie ${movieId}:`, err);
      return {
        movieId,
        movieTitle,
        region: targetRegion,
        providers: [
          {
            name: 'Amazon Prime Video',
            logo: 'https://image.tmdb.org/t/p/original/emthp39XA2zhcoYLKJsd3vTGQzV.jpg',
            type: 'subscription',
            ...generateDeepLink('Amazon Prime Video', movieTitle)
          },
          {
            name: 'Netflix',
            logo: 'https://image.tmdb.org/t/p/original/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
            type: 'subscription',
            ...generateDeepLink('Netflix', movieTitle)
          }
        ],
        hasDirectDeepLinks: true
      };
    }
  }

  public async fetchTrailer(movieId: number): Promise<{ movieId: number; trailerKey: string | null; videoUrl: string; source: 'tmdb' | 'search_fallback' | 'cached' }> {
    const movie = await this.fetchMovieDetails(movieId) || db.getMovieById(movieId);
    const movieTitle = movie ? movie.title : 'Movie';

    if (movie?.trailer_key && (movie.id === 27205 || movie.trailer_key !== 'YoHD9XEInc0')) {
      return {
        movieId,
        trailerKey: movie.trailer_key,
        videoUrl: `https://www.youtube-nocookie.com/embed/${movie.trailer_key}?autoplay=1&rel=0&modestbranding=1`,
        source: 'cached'
      };
    }

    if (!this.apiKey) {
      return {
        movieId,
        trailerKey: movie?.trailer_key || null,
        videoUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(movieTitle + ' official trailer')}&autoplay=1&rel=0&modestbranding=1`,
        source: 'search_fallback'
      };
    }

    try {
      const res = await fetch(`${TMDB_BASE_URL}/movie/${movieId}/videos?api_key=${this.apiKey}`, { headers: this.headers });
      if (!res.ok) throw new Error(`TMDb video error: ${res.status}`);
      const data = await res.json();
      const videos = data.results || [];

      const officialTrailer = videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
                             videos.find((v: any) => v.site === 'YouTube' && v.type === 'Trailer') ||
                             videos.find((v: any) => v.site === 'YouTube' && (v.type === 'Teaser' || v.type === 'Clip')) ||
                             videos.find((v: any) => v.site === 'YouTube');

      if (officialTrailer) {
        if (movie) {
          movie.trailer_key = officialTrailer.key;
          db.addOrUpdateMovie(movie);
        }
        return {
          movieId,
          trailerKey: officialTrailer.key,
          videoUrl: `https://www.youtube-nocookie.com/embed/${officialTrailer.key}?autoplay=1&rel=0&modestbranding=1`,
          source: 'tmdb'
        };
      }
    } catch (err) {
      console.warn(`[TMDB PIPELINE LOG] Video trailer fetch error for movie ${movieId}:`, err);
    }

    return {
      movieId,
      trailerKey: null,
      videoUrl: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(movieTitle + ' official trailer')}&autoplay=1&rel=0&modestbranding=1`,
      source: 'search_fallback'
    };
  }
}

export const tmdbService = new TMDbService();
