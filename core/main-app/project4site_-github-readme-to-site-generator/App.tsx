import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateSiteContentFromUrl } from './services/geminiService';
import { SiteData, AppState } from './types';
import { useAuth } from './contexts/AuthContext';
import { useGenerationTracking } from './hooks/useGenerationTracking';
import { performSystemHealthCheck } from './utils/healthCheck';
import { useRetry } from './hooks/useRetry';
import { useComponentPerformance, useMemoizedValue, useDebouncedState } from './hooks/usePerformance';
import { useServiceWorker, cacheUtils } from './utils/serviceWorker';
import { useProgressiveDisclosure } from './hooks/useProgressiveDisclosure';
import { useUserJourney } from './hooks/useUserJourney';
import { 
  LazyWrapper, 
  SimplePreviewTemplate,
  LoginModal,
  ConversionPrompt,
  ErrorBoundary,
  FloatingFeedbackButton,
  AIGenerationLoader,
  preloadComponents
} from './components/LazyComponents';
import CommissionDashboard from './components/admin/CommissionDashboard';
import { PerformanceMonitor, usePerformanceMonitor } from './components/monitoring/PerformanceMonitor';
import { UpdatedMainSection } from './components/sections/UpdatedMainSection';
import { initializeApp, getInitializationStatus } from './utils/appInitializer';
import { getPerformanceMonitor, AlertSeverity } from './utils/performanceMonitoring';
import './index.css';
import './styles/glassmorphism.css';
import './styles/developer-brand.css';
import './styles/enterprise-professional.css';

const App: React.FC = () => {
  // PHASE 4: Advanced performance monitoring and initialization
  const metrics = useComponentPerformance('App');
  const { isVisible: perfMonitorVisible, toggle: togglePerfMonitor } = usePerformanceMonitor();
  const [initializationStatus, setInitializationStatus] = useState<{
    success: boolean;
    initializationTime?: number;
    error?: string;
  } | null>(null);
  
  // Service worker integration
  const { status: swStatus, prefetchUrls } = useServiceWorker();
  
  // Auth and tracking
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const {
    anonymousGenerations,
    showSignupPrompt,
    setShowSignupPrompt,
    trackGeneration
  } = useGenerationTracking();
  
  // PHASE 1: Progressive disclosure and user journey tracking
  const {
    disclosureState,
    showPricingTiers,
    userJourneyStep,
    handleGenerationSuccess,
    handleDeploymentSuccess,
    handleEngagement,
    handleConversionReadiness,
    getConversionScore
  } = useProgressiveDisclosure({
    enableAbTesting: true,
    delayBeforeReveal: 3000,
    trackingCallback: (milestone) => {
      console.log('[App] Progressive disclosure milestone:', milestone);
    }
  });
  
  const {
    trackPageView,
    trackInteraction,
    trackMilestone,
    trackConversion,
    abTestAssignments,
    engagementScore,
    conversionProbability,
    isHighEngagement,
    isConversionReady
  } = useUserJourney({
    enableTracking: true,
    trackScrollDepth: true,
    trackExitIntent: true
  });
  
  // Core state
  const [appState, setAppState] = useState<AppState>(AppState.Idle);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeployPopup, setShowDeployPopup] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  
  // Optimized state with debouncing
  const [debouncedRepoUrl, setRepoUrl, repoUrl] = useDebouncedState<string>('', 150);
  const [debouncedPreviewUrl, setPreviewUrl, previewUrl] = useDebouncedState<string>('', 100);
  const [loading, setLoading] = useState(false);
  
  // Memoized values
  const showPreview = useMemoizedValue(() => {
    return debouncedPreviewUrl.length > 0;
  }, [debouncedPreviewUrl], 'showPreview');

  // Check if user is admin (simplified check for demo - would use proper role-based auth in production)
  const isAdmin = useMemoizedValue(() => {
    return user?.email?.includes('admin') || user?.email?.includes('tabs') || showAdminDashboard;
  }, [user?.email, showAdminDashboard], 'isAdmin');

  // Enhanced site generation with retry logic
  const { execute: executeGeneration, isRetrying, currentAttempt } = useRetry(
    generateSiteContentFromUrl,
    {
      maxAttempts: 3,
      delay: 2000,
      backoff: 'exponential',
      shouldRetry: (error, attempt) => {
        // Retry on network errors and timeouts
        const retryableErrors = ['NetworkError', 'TypeError', 'TimeoutError'];
        const message = error.message.toLowerCase();
        return (
          attempt < 3 && 
          (retryableErrors.includes(error.name) || 
           message.includes('network') || 
           message.includes('timeout') ||
           message.includes('fetch'))
        );
      },
      onRetry: (error, attempt) => {
        console.log(`Retrying site generation (attempt ${attempt}):`, error.message);
      }
    }
  );

  // PHASE 4: Advanced application initialization
  useEffect(() => {
    let mounted = true;
    
    const initializeApplication = async () => {
      try {
        console.log('[App] Initializing advanced performance systems...');
        
        const result = await initializeApp({
          enablePerformanceMonitoring: true,
          enableAssetOptimization: true,
          enableServiceWorker: true,
          enablePreloading: true,
          developmentMode: process.env.NODE_ENV === 'development'
        });
        
        if (mounted) {
          setInitializationStatus(result);
          
          if (result.success) {
            // Set up performance alert handling
            const monitor = getPerformanceMonitor();
            if (monitor) {
              monitor.onAlert((alert) => {
                if (alert.severity === AlertSeverity.CRITICAL) {
                  console.error('[App] Critical performance alert:', alert);
                  // Could trigger user notifications or automatic optimizations
                }
              });
            }
            
            console.log(`[App] ✅ Application initialized in ${result.initializationTime?.toFixed(2)}ms`);
          } else {
            console.error('[App] ❌ Application initialization failed:', result.error);
          }
        }
      } catch (error) {
        console.error('[App] Failed to initialize application:', error);
        if (mounted) {
          setInitializationStatus({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    };
    
    initializeApplication();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Performance optimizations and intelligent preloading
  useEffect(() => {
    // Preload components when user starts interacting
    if (repoUrl.length > 3) {
      preloadComponents.preloadTemplates();
    }
    
    // Preload auth components for unauthenticated users
    if (!user && repoUrl.length > 0) {
      preloadComponents.preloadAuth();
    }
    
    // Prefetch critical resources
    if (swStatus.activated) {
      prefetchUrls([
        '/4sitepro-logo.png',
        '/ae4sitepro-assets/branding/'
      ]);
    }
  }, [repoUrl, user, swStatus.activated, prefetchUrls]);

  // Memoized URL processing function
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setRepoUrl(value);
    
    // Process URL patterns with memoized logic
    let expandedUrl = '';
    
    if (value.match(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)) {
      expandedUrl = `https://github.com/${value}`;
    } else if (value.match(/^github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)) {
      expandedUrl = `https://${value}`;
    } else if (value.startsWith('github.com/')) {
      expandedUrl = `https://${value}`;
    }
    
    setPreviewUrl(expandedUrl);
  }, [setRepoUrl, setPreviewUrl]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debouncedRepoUrl.trim()) return;

    // Smart URL processing - automatically format GitHub repository shortcuts
    let processedUrl = debouncedRepoUrl.trim();
    
    // Convert "owner/repo" format to full GitHub URL
    if (processedUrl.match(/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)) {
      processedUrl = `https://github.com/${processedUrl}`;
    }
    // Convert "github.com/owner/repo" to full URL
    else if (processedUrl.match(/^github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/)) {
      processedUrl = `https://${processedUrl}`;
    }
    // Ensure https:// prefix for other github.com URLs
    else if (processedUrl.startsWith('github.com/')) {
      processedUrl = `https://${processedUrl}`;
    }

    // Update the display URL
    setRepoUrl(processedUrl);

    // OpenRouter API key is handled automatically in the service
    // No need for manual API key validation here

    setLoading(true);
    setError(null);
    setAppState(AppState.Loading);
    setGenerationStartTime(Date.now());

    try {
      const data = await executeGeneration(processedUrl);
      
      // Ensure we have a valid SiteData object, not a string
      if (!data || typeof data === 'string') {
        throw new Error('Invalid response from content generator');
      }
      
      setSiteData(data);
      setAppState(AppState.Success);
      
      // PHASE 1: Track generation success for progressive disclosure
      handleGenerationSuccess({
        url: processedUrl,
        generationTime: Date.now() - (generationStartTime || Date.now()),
        model: data.generatedBy || 'ai-powered'
      });
      
      // Track generation for anonymous users (conversion trigger)
      trackGeneration();
      
      // User journey tracking
      trackMilestone('generation_complete', {
        url: processedUrl,
        success: true,
        engagementScore: engagementScore
      });
    } catch (err) {
      console.error('Generation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate site';
      
      // Enhanced error message with retry information
      if (isRetrying) {
        setError(`${errorMessage} (Retrying... attempt ${currentAttempt}/3)`);
      } else {
        setError(errorMessage);
      }
      
      setAppState(AppState.Error);
    } finally {
      setLoading(false);
      setGenerationStartTime(null);
    }
  }, [debouncedRepoUrl, executeGeneration, isRetrying, currentAttempt, trackGeneration]);

  const handleReset = useCallback(() => {
    setAppState(AppState.Idle);
    setSiteData(null);
    setError(null);
    setRepoUrl('');
    setPreviewUrl('');
    setShowPreview(false);
  }, []);

  // Handle conversion prompt actions
  const handleSignUpFromPrompt = useCallback(() => {
    setShowSignupPrompt(false);
    setShowLoginModal(true);
  }, [setShowSignupPrompt]);

  // Health check endpoint - accessible via ?health=true
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('health') === 'true') {
      performSystemHealthCheck().then(health => {
        console.log('System Health Check:', health);
        // Replace page content with health check results in JSON format for monitoring
        document.body.innerHTML = `<pre style="font-family: monospace; padding: 20px; background: #0f0f0f; color: #00ff00;">${JSON.stringify(health, null, 2)}</pre>`;
      });
    }
  }, []);

  return (
    <LazyWrapper fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="glass-text-body">Loading 4site.pro - Living Websites...</div>
      </div>
    }>
      <ErrorBoundary>
        {/* PHASE 2: Pure Pitch Black Foundation */}
        <div className="glass-foundation" />
        
        <div className="min-h-screen text-white overflow-hidden relative z-10">
      {/* PHASE 2: Revolutionary Glass Background Effects */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(255,215,0,0.06)_0%,transparent_40%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_70%,rgba(255,193,7,0.04)_0%,transparent_40%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(0,0,0,0.8)_100%)]" />
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* PHASE 2: Revolutionary Glass Navigation */}
        <nav className="sticky top-0 z-50 glass-primary border-b border-white/10">
          <div className="max-w-7xl mx-auto glass-padding-md">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center glass-gap-sm">
                <div className="glass-design-element w-10 h-10">
                  <div className="glass-design-element-icon glass-text-caption font-bold">
                    4S
                  </div>
                </div>
                <span className="glass-text-title font-mono">
                  <span className="text-blue-400">4site</span>
                  <span className="text-yellow-400">.pro</span>
                </span>
              </div>
              <div className="flex items-center glass-gap-md">
                <button className="glass-button glass-padding-sm glass-text-caption font-mono transition-all">
                  <div className="glass-button-content">
                    <span className="text-white/60">#</span> features
                  </div>
                </button>
                <button className="glass-button glass-padding-sm glass-text-caption font-mono transition-all">
                  <div className="glass-button-content">
                    <span className="text-white/60">$</span> pricing
                  </div>
                </button>
                
                {/* Admin Dashboard Access */}
                {isAdmin && (
                  <button 
                    onClick={() => setShowAdminDashboard(!showAdminDashboard)}
                    className={`glass-button glass-padding-sm glass-text-caption font-mono transition-all ${
                      showAdminDashboard 
                        ? 'glass-animate-glow' 
                        : ''
                    }`}
                    style={{
                      background: showAdminDashboard ? 'rgba(16, 185, 129, 0.2)' : undefined
                    }}
                  >
                    <div className="glass-button-content">
                      <span className="text-white/60">@</span> admin
                    </div>
                  </button>
                )}
                
                {/* Authentication Controls */}
                {authLoading ? (
                  <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                ) : user ? (
                  <div className="flex items-center glass-gap-sm">
                    <div className="glass-text-micro">
                      {profile?.tier && (
                        <span className="glass-badge glass-padding-xs font-mono text-emerald-400">
                          <div className="glass-badge-content">
                            {profile.tier}
                          </div>
                        </span>
                      )}
                    </div>
                    <div className="glass-text-caption font-mono text-white">
                      {user.email}
                    </div>
                    <button 
                      onClick={signOut}
                      className="glass-button glass-padding-sm glass-text-caption font-mono transition-all"
                    >
                      <div className="glass-button-content">
                        logout
                      </div>
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowLoginModal(true)}
                    className="glass-button glass-padding-sm glass-text-caption font-mono glass-animate-glow transition-all"
                    style={{ background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 215, 0, 0.1))' }}
                  >
                    <div className="glass-button-content">
                      auth
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        </nav>

        {/* Admin Dashboard */}
        {showAdminDashboard && (
          <LazyWrapper>
            <CommissionDashboard />
          </LazyWrapper>
        )}

        {!showAdminDashboard && appState === AppState.Idle && (
          <main>
            {/* PHASE 1: Progressive Disclosure Main Section */}
            <UpdatedMainSection 
              onGenerateSite={(repoUrl) => {
                // Track interaction
                trackInteraction('url_input', 'submit', { url: repoUrl });
                
                setRepoUrl(repoUrl);
                setPreviewUrl(repoUrl.includes('github.com') ? repoUrl : `https://github.com/${repoUrl}`);
                
                // Trigger form submission automatically
                setTimeout(() => {
                  const form = document.querySelector('form') as HTMLFormElement;
                  if (form) form.requestSubmit();
                }, 100);
              }}
              onSelectTier={(tier) => {
                // Track tier selection for conversion analysis
                trackInteraction('tier_selection', 'click', { 
                  tier, 
                  conversionScore: getConversionScore(),
                  engagementScore 
                });
                
                // Trigger conversion readiness
                handleConversionReadiness();
                
                console.log('Selected tier:', tier);
              }}
              onUpgrade={(tier) => {
                // Track upgrade conversion
                trackConversion('tier_upgrade', tier === 'pro' ? 49.49 : 494.94, { 
                  tier,
                  fromFree: true,
                  abTestVariant: abTestAssignments.successFlow
                });
                
                console.log('Upgrade to tier:', tier);
              }}
              // PHASE 1: Enhanced progressive disclosure with psychological flow
              showProgressiveFeatures={showPricingTiers}
              generationSuccess={appState === AppState.Success}
              deploymentSuccess={false} // Will be triggered by actual deployment
              enablePsychologicalFlow={true}
              personalityType={'pragmatic'} // Could be determined by user behavior analysis
              abTestVariant={abTestAssignments.successFlow || 'living_websites'}
            />

            {/* PHASE 2: Glass Error Display */}
            {error && (
              <div className="max-w-4xl mx-auto glass-padding-md">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-primary glass-padding-lg border border-red-400/30 text-red-300 glass-spacing-lg"
                >
                  <div className="glass-text-body font-mono">
                    <span className="text-white/50"># Error:</span> {error}
                  </div>
                </motion.div>
              </div>
            )}

            {/* Hidden form for programmatic submission */}
            <form onSubmit={handleSubmit} style={{ display: 'none' }}>
              <input type="text" value={debouncedRepoUrl} readOnly />
              <button type="submit">Submit</button>
            </form>
          </main>
        )}

        {!showAdminDashboard && appState === AppState.Loading && (
          <div className="flex items-center justify-center min-h-screen">
            <LazyWrapper>
              <AIGenerationLoader
                isLoading={true}
                stage={isRetrying ? 'retrying' : 'analyzing'}
                progress={isRetrying ? (currentAttempt / 3) * 100 : 25}
                message={isRetrying ? `Retrying generation (${currentAttempt}/3)` : 'Analyzing repository and generating site...'}
                substeps={[
                  'Fetching repository data',
                  'Analyzing README content',
                  'Processing with AI',
                  'Generating site structure',
                  'Finalizing design'
                ]}
                estimatedTime={30000}
                startTime={generationStartTime || undefined}
              />
            </LazyWrapper>
          </div>
        )}

        {!showAdminDashboard && appState === AppState.Success && siteData && (
          <div className="relative">
            {/* Demo Mode Banner */}
            {siteData.generatedBy === 'demo-mode' && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50"
              >
                <div className="backdrop-blur-xl bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/30 rounded-xl px-6 py-3 text-center">
                  <div className="flex items-center gap-2 text-yellow-300">
                    <span className="text-lg">🎭</span>
                    <span className="font-semibold">Demo Mode Active</span>
                    <span className="text-lg">🎭</span>
                  </div>
                  <p className="text-xs text-yellow-200/80 mt-1">
                    This is a preview of your living website. Get your API key to unlock full AI-powered content generation!
                  </p>
                </div>
              </motion.div>
            )}
            
            {/* Site Preview */}
            <LazyWrapper>
              <SimplePreviewTemplate siteData={siteData} />
            </LazyWrapper>
            
            {/* PHASE 2: Revolutionary Glass Floating Action Bar */}
            <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
              <div className="glass-primary glass-padding-md flex glass-gap-sm glass-animate-glow">
                <button 
                  onClick={() => {
                    // Track deployment interaction
                    trackInteraction('deploy_button', 'click', {
                      conversionScore: getConversionScore(),
                      engagementScore,
                      isConversionReady
                    });
                    
                    // Trigger deployment success for progressive disclosure
                    handleDeploymentSuccess({
                      platform: 'github_pages',
                      siteData: siteData?.title
                    });
                    
                    setShowDeployPopup(true);
                  }}
                  className="glass-button glass-padding-md glass-text-body font-semibold transition-all"
                  style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.6), rgba(5, 150, 105, 0.4))' }}
                >
                  <div className="glass-button-content flex items-center glass-gap-xs">
                    <span className="text-xl">🚀</span>
                    Deploy to GitHub Pages
                  </div>
                </button>
                <button 
                  onClick={() => {
                    trackInteraction('retry_button', 'click');
                    handleReset();
                  }}
                  className="glass-button glass-padding-md glass-text-body font-semibold transition-all"
                >
                  <div className="glass-button-content flex items-center glass-gap-xs">
                    <span className="text-xl">🔄</span>
                    Retry
                  </div>
                </button>
                <button 
                  onClick={() => {
                    trackInteraction('edit_button', 'click');
                    setShowDeployPopup(true);
                  }}
                  className="glass-button glass-padding-md glass-text-body font-semibold transition-all"
                  style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.4))' }}
                >
                  <div className="glass-button-content flex items-center glass-gap-xs">
                    <span className="text-xl">✏️</span>
                    Edit
                  </div>
                </button>
              </div>
            </div>

            {/* PHASE 2: Revolutionary Glass Deployment Popup */}
            <AnimatePresence>
              {showDeployPopup && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/60 backdrop-blur-lg z-50 flex items-center justify-center glass-padding-md"
                  onClick={() => setShowDeployPopup(false)}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="glass-primary glass-padding-xl max-w-md w-full relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="glass-text-title text-white glass-spacing-lg">Deploy Your Site</h3>
                    
                    <div className="glass-gap-md flex flex-col">
                      <button className="glass-button glass-padding-lg transition-all glass-animate-shimmer w-full"
                              style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.6), rgba(5, 150, 105, 0.4))' }}>
                        <div className="glass-button-content flex items-center glass-gap-sm">
                          <span className="text-2xl">🚀</span>
                          <div className="text-left">
                            <div className="glass-text-body font-semibold">Deploy to GitHub Pages</div>
                            <div className="glass-text-caption opacity-80">Free hosting on GitHub</div>
                          </div>
                        </div>
                      </button>
                      
                      <button className="glass-button glass-padding-lg transition-all w-full"
                              style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.6), rgba(37, 99, 235, 0.4))' }}>
                        <div className="glass-button-content flex items-center glass-gap-sm">
                          <span className="text-2xl">✏️</span>
                          <div className="text-left">
                            <div className="glass-text-body font-semibold">Edit Site</div>
                            <div className="glass-text-caption opacity-80">Customize before deploying</div>
                          </div>
                        </div>
                      </button>
                      
                      <button 
                        onClick={handleReset}
                        className="glass-button glass-padding-lg transition-all w-full"
                      >
                        <div className="glass-button-content flex items-center glass-gap-sm">
                          <span className="text-2xl">🔄</span>
                          <div className="text-left">
                            <div className="glass-text-body font-semibold">Generate Another</div>
                            <div className="glass-text-caption opacity-80">Try a different repository</div>
                          </div>
                        </div>
                      </button>
                    </div>
                    
                    <button 
                      onClick={() => setShowDeployPopup(false)}
                      className="absolute top-4 right-4 text-white/60 hover:text-white text-xl glass-text-title"
                    >
                      ✕
                    </button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Login Modal */}
        {showLoginModal && (
          <LazyWrapper>
            <LoginModal 
              isOpen={showLoginModal} 
              onClose={() => setShowLoginModal(false)} 
            />
          </LazyWrapper>
        )}

        {/* Conversion Prompt */}
        {showSignupPrompt && (
          <LazyWrapper>
            <ConversionPrompt
              isOpen={showSignupPrompt}
              onClose={() => setShowSignupPrompt(false)}
              onSignUp={handleSignUpFromPrompt}
              generationCount={anonymousGenerations}
            />
          </LazyWrapper>
        )}

        {/* Floating Feedback Button */}
        <LazyWrapper>
          <FloatingFeedbackButton />
        </LazyWrapper>

        {/* Performance Monitor */}
        <PerformanceMonitor 
          isVisible={perfMonitorVisible} 
          onToggle={togglePerfMonitor} 
        />
        </div>
      </div>
      </ErrorBoundary>
    </LazyWrapper>
  );
};

export default App;