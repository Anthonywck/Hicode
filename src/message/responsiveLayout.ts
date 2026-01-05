/**
 * Responsive layout utilities for Chat interface
 * Provides adaptive layout based on viewport size
 */

export interface LayoutConfig {
  breakpoint: 'mobile' | 'tablet' | 'desktop';
  width: number;
  height: number;
  messageWidth: number;
  fontSize: number;
  spacing: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Breakpoint thresholds
 */
export const BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
} as const;

/**
 * Get current breakpoint based on viewport width
 */
export function getBreakpoint(width: number): 'mobile' | 'tablet' | 'desktop' {
  if (width < BREAKPOINTS.mobile) {
    return 'mobile';
  }
  if (width < BREAKPOINTS.tablet) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Get layout configuration for current viewport
 */
export function getLayoutConfig(viewport: ViewportSize): LayoutConfig {
  const breakpoint = getBreakpoint(viewport.width);
  
  const configs: Record<'mobile' | 'tablet' | 'desktop', Omit<LayoutConfig, 'width' | 'height'>> = {
    mobile: {
      breakpoint: 'mobile',
      messageWidth: viewport.width - 32, // 16px padding on each side
      fontSize: 14,
      spacing: 8,
    },
    tablet: {
      breakpoint: 'tablet',
      messageWidth: Math.min(viewport.width - 64, 600),
      fontSize: 15,
      spacing: 12,
    },
    desktop: {
      breakpoint: 'desktop',
      messageWidth: Math.min(viewport.width - 128, 800),
      fontSize: 16,
      spacing: 16,
    },
  };
  
  return {
    ...configs[breakpoint],
    width: viewport.width,
    height: viewport.height,
  };
}

/**
 * Calculate optimal number of visible messages
 */
export function calculateVisibleMessages(
  viewport: ViewportSize,
  averageMessageHeight: number = 100
): number {
  const availableHeight = viewport.height - 200; // Reserve space for input and header
  return Math.max(3, Math.floor(availableHeight / averageMessageHeight));
}

/**
 * Check if viewport is in mobile mode
 */
export function isMobileViewport(width: number): boolean {
  return width < BREAKPOINTS.mobile;
}

/**
 * Check if viewport is in tablet mode
 */
export function isTabletViewport(width: number): boolean {
  return width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet;
}

/**
 * Check if viewport is in desktop mode
 */
export function isDesktopViewport(width: number): boolean {
  return width >= BREAKPOINTS.tablet;
}

/**
 * Get responsive font size
 */
export function getResponsiveFontSize(baseSize: number, viewport: ViewportSize): number {
  const breakpoint = getBreakpoint(viewport.width);
  
  const scales = {
    mobile: 0.875,  // 87.5% of base
    tablet: 0.9375, // 93.75% of base
    desktop: 1.0,   // 100% of base
  };
  
  return Math.round(baseSize * scales[breakpoint]);
}

/**
 * Get responsive spacing
 */
export function getResponsiveSpacing(baseSpacing: number, viewport: ViewportSize): number {
  const breakpoint = getBreakpoint(viewport.width);
  
  const scales = {
    mobile: 0.75,  // 75% of base
    tablet: 0.875, // 87.5% of base
    desktop: 1.0,  // 100% of base
  };
  
  return Math.round(baseSpacing * scales[breakpoint]);
}

/**
 * Generate CSS media queries
 */
export function generateMediaQueries(): string {
  return `
    @media (max-width: ${BREAKPOINTS.mobile}px) {
      .chat-container {
        padding: 8px;
      }
      .message {
        font-size: 14px;
        margin-bottom: 8px;
      }
    }
    
    @media (min-width: ${BREAKPOINTS.mobile + 1}px) and (max-width: ${BREAKPOINTS.tablet}px) {
      .chat-container {
        padding: 12px;
      }
      .message {
        font-size: 15px;
        margin-bottom: 12px;
      }
    }
    
    @media (min-width: ${BREAKPOINTS.tablet + 1}px) {
      .chat-container {
        padding: 16px;
      }
      .message {
        font-size: 16px;
        margin-bottom: 16px;
      }
    }
  `;
}

/**
 * Adjust layout on viewport resize
 */
export function handleViewportResize(
  callback: (config: LayoutConfig) => void
): () => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  const handleResize = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      const viewport: ViewportSize = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      
      const config = getLayoutConfig(viewport);
      callback(config);
    }, 150); // Debounce resize events
  };
  
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
    
    // Initial call
    handleResize();
    
    // Return cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }
  
  return () => {}; // No-op for non-browser environments
}

/**
 * Get optimal column count for grid layout
 */
export function getGridColumns(viewport: ViewportSize): number {
  const breakpoint = getBreakpoint(viewport.width);
  
  const columns = {
    mobile: 1,
    tablet: 2,
    desktop: 3,
  };
  
  return columns[breakpoint];
}
