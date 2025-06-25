/**
 * Advanced Service Worker for 4site.pro
 * Implements intelligent caching, offline support, and performance optimization
 */

const CACHE_VERSION = '1.0.0';
const CACHE_NAME = `4site-pro-static-v${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `4site-pro-dynamic-v${CACHE_VERSION}`;
const API_CACHE_NAME = `4site-pro-api-v${CACHE_VERSION}`;
const CRITICAL_CACHE_NAME = `4site-pro-critical-v${CACHE_VERSION}`;
const IMAGE_CACHE_NAME = `4site-pro-images-v${CACHE_VERSION}`;

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first', 
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only'
};

// Critical assets (highest priority)
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/4sitepro-logo.png'
];

// Static assets to cache immediately
const STATIC_ASSETS = [
  ...CRITICAL_ASSETS,
  '/manifest.json',
  '/favicon.ico',
  '/ae4sitepro-assets/branding/',
  // CSS and JS will be handled by build process
];

// Image patterns for optimized caching
const IMAGE_PATTERNS = [
  /\.(?:png|jpg|jpeg|svg|gif|webp|avif)$/,
  /\/images\//,
  /\/assets\/.*\.(png|jpg|jpeg|svg|gif|webp|avif)$/
];

// Font patterns
const FONT_PATTERNS = [
  /\.(?:woff2?|eot|ttf|otf)$/,
  /\/fonts\//,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /^https:\/\/api\.github\.com\/repos\/.*\/readme$/,
  /^https:\/\/raw\.githubusercontent\.com\/.*\/README\.md$/,
  /^https:\/\/generativelanguage\.googleapis\.com\/.*$/
];

// Network-first patterns (always try network first)
const NETWORK_FIRST_PATTERNS = [
  /^https:\/\/generativelanguage\.googleapis\.com\//,
  /\/api\//
];

// Cache-first patterns (serve from cache, update in background)
const CACHE_FIRST_PATTERNS = [
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  /\.(?:css|js)$/,
  /^https:\/\/fonts\./,
  /^https:\/\/cdn\./
];

/**
 * Install event - cache critical and static assets
 */
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache critical assets first (highest priority)
      caches.open(CRITICAL_CACHE_NAME).then((cache) => {
        console.log('[ServiceWorker] Caching critical assets');
        return cache.addAll(CRITICAL_ASSETS);
      }),
      
      // Cache static assets
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[ServiceWorker] Caching static assets');
        return cache.addAll(STATIC_ASSETS.filter(asset => !CRITICAL_ASSETS.includes(asset)));
      })
    ]).then(() => {
      console.log('[ServiceWorker] Skip waiting');
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - clean up old caches and optimize storage
 */
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating...');
  
  const currentCaches = [
    CACHE_NAME, 
    DYNAMIC_CACHE_NAME, 
    API_CACHE_NAME,
    CRITICAL_CACHE_NAME,
    IMAGE_CACHE_NAME
  ];
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!currentCaches.includes(cacheName)) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Optimize cache storage (remove expired entries)
      optimizeCacheStorage(),
      
      // Initialize performance metrics
      initializePerformanceMetrics()
    ]).then(() => {
      console.log('[ServiceWorker] Claiming clients');
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other protocols
  if (!url.protocol.startsWith('http')) {
    return;
  }

  event.respondWith(handleRequest(request));
});

/**
 * Main request handler with intelligent caching
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // Determine caching strategy based on URL patterns
    const strategy = getCachingStrategy(url);
    
    switch (strategy) {
      case CACHE_STRATEGIES.CACHE_FIRST:
        return await cacheFirst(request);
      
      case CACHE_STRATEGIES.NETWORK_FIRST:
        return await networkFirst(request);
      
      case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
        return await staleWhileRevalidate(request);
        
      case CACHE_STRATEGIES.NETWORK_ONLY:
        return await fetch(request);
        
      case CACHE_STRATEGIES.CACHE_ONLY:
        return await caches.match(request);
        
      default:
        return await networkFirst(request);
    }
  } catch (error) {
    console.error('[ServiceWorker] Request failed:', error);
    return await handleOfflineFallback(request);
  }
}

/**
 * Advanced caching strategy determination with priority levels
 */
function getCachingStrategy(url) {
  // Critical assets - cache only (never hit network)
  if (CRITICAL_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    return CACHE_STRATEGIES.CACHE_FIRST;
  }
  
  // Images - cache first with long TTL
  if (IMAGE_PATTERNS.some(pattern => pattern.test(url.href))) {
    return CACHE_STRATEGIES.CACHE_FIRST;
  }
  
  // Fonts - cache first (long-lived)
  if (FONT_PATTERNS.some(pattern => pattern.test(url.href))) {
    return CACHE_STRATEGIES.CACHE_FIRST;
  }
  
  // API endpoints - network first with fast fallback
  if (NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url.href))) {
    return CACHE_STRATEGIES.NETWORK_FIRST;
  }
  
  // Static assets - cache first
  if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.href))) {
    return CACHE_STRATEGIES.CACHE_FIRST;
  }
  
  // GitHub API - stale while revalidate with race condition
  if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.href))) {
    return CACHE_STRATEGIES.STALE_WHILE_REVALIDATE;
  }
  
  // HTML pages - stale while revalidate
  if (url.pathname.endsWith('.html') || url.pathname === '/' || !url.pathname.includes('.')) {
    return CACHE_STRATEGIES.STALE_WHILE_REVALIDATE;
  }
  
  // Default to network first
  return CACHE_STRATEGIES.NETWORK_FIRST;
}

/**
 * Cache First Strategy
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    event.waitUntil(updateCache(request));
    return cachedResponse;
  }
  
  const networkResponse = await fetch(request);
  await cacheResponse(request, networkResponse.clone());
  return networkResponse;
}

/**
 * Network First Strategy
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      await cacheResponse(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[ServiceWorker] Network failed, trying cache');
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Stale While Revalidate Strategy
 */
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  
  // Always update cache in background
  const networkPromise = fetch(request)
    .then(response => {
      if (response.ok) {
        cacheResponse(request, response.clone());
      }
      return response;
    })
    .catch(error => {
      console.log('[ServiceWorker] Background update failed:', error);
    });
  
  // Return cached version immediately if available
  if (cachedResponse) {
    event.waitUntil(networkPromise);
    return cachedResponse;
  }
  
  // If no cache, wait for network
  return networkPromise;
}

/**
 * Advanced cache response with TTL and compression awareness
 */
async function cacheResponse(request, response) {
  const url = new URL(request.url);
  let cacheName = DYNAMIC_CACHE_NAME;
  
  // Determine appropriate cache based on content type and URL patterns
  if (CRITICAL_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    cacheName = CRITICAL_CACHE_NAME;
  } else if (IMAGE_PATTERNS.some(pattern => pattern.test(url.href))) {
    cacheName = IMAGE_CACHE_NAME;
  } else if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.href))) {
    cacheName = API_CACHE_NAME;
  } else if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.href))) {
    cacheName = CACHE_NAME;
  }
  
  // Clone response and add metadata
  const responseToCache = response.clone();
  const headers = new Headers(responseToCache.headers);
  headers.set('sw-cached-time', Date.now().toString());
  headers.set('sw-cache-name', cacheName);
  
  const cache = await caches.open(cacheName);
  
  // Create enhanced response with metadata
  const enhancedResponse = new Response(responseToCache.body, {
    status: responseToCache.status,
    statusText: responseToCache.statusText,
    headers: headers
  });
  
  await cache.put(request, enhancedResponse);
  
  // Update cache size metrics
  updateCacheMetrics(cacheName);
}

/**
 * Update cache in background
 */
async function updateCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cacheResponse(request, response);
    }
  } catch (error) {
    console.log('[ServiceWorker] Background cache update failed:', error);
  }
}

/**
 * Handle offline fallbacks
 */
async function handleOfflineFallback(request) {
  const url = new URL(request.url);
  
  // Try to serve from cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Serve offline page for navigation requests
  if (request.destination === 'document') {
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
  }
  
  // Serve placeholder for images
  if (request.destination === 'image') {
    const placeholder = await caches.match('/offline-image.svg');
    if (placeholder) {
      return placeholder;
    }
  }
  
  // Return generic offline response
  return new Response(
    JSON.stringify({
      error: 'Offline',
      message: 'This request requires an internet connection'
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

/**
 * Background sync for failed requests
 */
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync:', event.tag);
  
  if (event.tag === 'failed-requests') {
    event.waitUntil(retryFailedRequests());
  }
});

/**
 * Retry failed requests when connection is restored
 */
async function retryFailedRequests() {
  const failedRequests = await getFailedRequests();
  
  for (const request of failedRequests) {
    try {
      await fetch(request);
      await removeFailedRequest(request);
    } catch (error) {
      console.log('[ServiceWorker] Retry failed:', error);
    }
  }
}

/**
 * Store failed requests for retry
 */
async function storeFailedRequest(request) {
  const db = await openDB();
  const tx = db.transaction(['failed-requests'], 'readwrite');
  const store = tx.objectStore('failed-requests');
  await store.add({
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: await request.text(),
    timestamp: Date.now()
  });
}

/**
 * Message handling for cache management
 */
self.addEventListener('message', (event) => {
  const { action, data } = event.data;
  
  switch (action) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearCaches(data.cacheNames);
      break;
      
    case 'PREFETCH':
      prefetchResources(data.urls);
      break;
      
    case 'GET_CACHE_SIZE':
      getCacheSize().then(size => {
        event.ports[0].postMessage({ size });
      });
      break;
  }
});

/**
 * Clear specified caches
 */
async function clearCaches(cacheNames = []) {
  if (cacheNames.length === 0) {
    cacheNames = [CACHE_NAME, DYNAMIC_CACHE_NAME, API_CACHE_NAME];
  }
  
  for (const cacheName of cacheNames) {
    await caches.delete(cacheName);
    console.log('[ServiceWorker] Cleared cache:', cacheName);
  }
}

/**
 * Prefetch resources
 */
async function prefetchResources(urls) {
  const cache = await caches.open(CACHE_NAME);
  
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch (error) {
      console.log('[ServiceWorker] Prefetch failed for:', url, error);
    }
  }
}

/**
 * Get total cache size
 */
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const size = await getResponseSize(response);
        totalSize += size;
      }
    }
  }
  
  return totalSize;
}

/**
 * Get response size estimate
 */
async function getResponseSize(response) {
  const text = await response.clone().text();
  return new Blob([text]).size;
}

// Advanced performance monitoring and request racing
const performanceMetrics = {
  requests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averageResponseTime: 0,
  slowRequests: 0
};

/**
 * Enhanced fetch handler with performance monitoring and request racing
 */
self.addEventListener('fetch', (event) => {
  const start = performance.now();
  performanceMetrics.requests++;
  
  event.respondWith(
    handleRequestWithRacing(event.request).then(response => {
      const duration = performance.now() - start;
      
      // Update performance metrics
      performanceMetrics.averageResponseTime = 
        (performanceMetrics.averageResponseTime + duration) / 2;
      
      // Track slow requests
      if (duration > 1000) {
        performanceMetrics.slowRequests++;
        console.warn('[ServiceWorker] Slow request:', event.request.url, `${duration.toFixed(2)}ms`);
      }
      
      // Report metrics periodically
      if (performanceMetrics.requests % 100 === 0) {
        reportPerformanceMetrics();
      }
      
      return response;
    })
  );
});

/**
 * Advanced request handling with race conditions and intelligent fallbacks
 */
async function handleRequestWithRacing(request) {
  const url = new URL(request.url);
  const strategy = getCachingStrategy(url);
  
  // For critical resources, try cache first with network race
  if (CRITICAL_ASSETS.some(asset => url.pathname === asset || url.pathname.endsWith(asset))) {
    return await Promise.race([
      cacheFirst(request),
      networkFirst(request).catch(() => null)
    ]).then(response => response || handleOfflineFallback(request));
  }
  
  // For images, use cache first with background update
  if (IMAGE_PATTERNS.some(pattern => pattern.test(url.href))) {
    const cached = await caches.match(request);
    if (cached) {
      // Update in background
      event.waitUntil(
        fetch(request).then(response => {
          if (response.ok) {
            cacheResponse(request, response.clone());
          }
        }).catch(() => {})
      );
      return cached;
    }
    return await networkFirst(request);
  }
  
  // Default to strategy-based handling
  return await handleRequest(request);
}

/**
 * Optimize cache storage by removing expired or oversized entries
 */
async function optimizeCacheStorage() {
  const maxCacheSize = 50 * 1024 * 1024; // 50MB total
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  const cacheNames = await caches.keys();
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const cachedTime = response.headers.get('sw-cached-time');
        if (cachedTime && Date.now() - parseInt(cachedTime) > maxAge) {
          await cache.delete(request);
          console.log('[ServiceWorker] Removed expired cache entry:', request.url);
        }
      }
    }
  }
}

/**
 * Initialize performance metrics tracking
 */
async function initializePerformanceMetrics() {
  // Reset metrics on service worker activation
  Object.keys(performanceMetrics).forEach(key => {
    if (typeof performanceMetrics[key] === 'number') {
      performanceMetrics[key] = 0;
    }
  });
  
  console.log('[ServiceWorker] Performance metrics initialized');
}

/**
 * Update cache size metrics
 */
async function updateCacheMetrics(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    console.log(`[ServiceWorker] Cache ${cacheName} now contains ${requests.length} entries`);
  } catch (error) {
    console.warn('[ServiceWorker] Failed to update cache metrics:', error);
  }
}

/**
 * Report performance metrics to analytics
 */
function reportPerformanceMetrics() {
  const metrics = {
    ...performanceMetrics,
    cacheHitRate: performanceMetrics.cacheHits / (performanceMetrics.cacheHits + performanceMetrics.cacheMisses),
    timestamp: Date.now()
  };
  
  console.log('[ServiceWorker] Performance Metrics:', metrics);
  
  // Send metrics to all clients
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'PERFORMANCE_METRICS',
        data: metrics
      });
    });
  });
}

/**
 * Advanced preloading with priority and bandwidth awareness
 */
async function intelligentPreload(urls, priority = 'low') {
  // Check connection type if available
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  
  // Skip preloading on slow connections for non-critical resources
  if (connection && priority === 'low' && 
      (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g')) {
    console.log('[ServiceWorker] Skipping preload on slow connection');
    return;
  }
  
  const cache = await caches.open(priority === 'critical' ? CRITICAL_CACHE_NAME : CACHE_NAME);
  
  for (const url of urls) {
    try {
      // Check if already cached
      const cached = await cache.match(url);
      if (!cached) {
        const response = await fetch(url, { priority: priority === 'critical' ? 'high' : 'low' });
        if (response.ok) {
          await cache.put(url, response);
          console.log(`[ServiceWorker] Preloaded: ${url}`);
        }
      }
    } catch (error) {
      console.warn(`[ServiceWorker] Preload failed for: ${url}`, error);
    }
  }
}

/**
 * Enhanced message handling with new commands
 */
self.addEventListener('message', (event) => {
  const { action, data } = event.data;
  
  switch (action) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearCaches(data?.cacheNames);
      break;
      
    case 'PREFETCH':
      intelligentPreload(data.urls, data.priority);
      break;
      
    case 'PRELOAD_CRITICAL':
      intelligentPreload(CRITICAL_ASSETS, 'critical');
      break;
      
    case 'GET_CACHE_SIZE':
      getCacheSize().then(size => {
        event.ports[0]?.postMessage({ size });
      });
      break;
      
    case 'GET_METRICS':
      event.ports[0]?.postMessage({ metrics: performanceMetrics });
      break;
      
    case 'OPTIMIZE_STORAGE':
      optimizeCacheStorage();
      break;
  }
});

console.log('[ServiceWorker] Advanced Service Worker v2.0 loaded with intelligent caching');