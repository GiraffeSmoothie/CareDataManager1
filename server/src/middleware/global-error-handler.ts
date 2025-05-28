import { storage } from '../../storage';

/**
 * Global error handlers for unhandled errors and promise rejections
 */

// Handle uncaught exceptions
process.on('uncaughtException', async (error: Error) => {
  console.error('🚨 UNCAUGHT EXCEPTION:', error);
  
  try {
    await storage.logError({
      errorType: 'UNCAUGHT_EXCEPTION',
      errorCode: 'UNCAUGHT_EXCEPTION',
      errorMessage: error.message,
      stackTrace: error.stack,
      severity: 'CRITICAL',
      metadata: {
        processId: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date()
      },
      timestamp: new Date()
    });
  } catch (logError) {
    console.error('Failed to log uncaught exception:', logError);
  }

  // Give time for logging to complete before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason: any, promise: Promise<any>) => {
  console.error('🚨 UNHANDLED PROMISE REJECTION:', reason);
  
  try {
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    const stackTrace = reason instanceof Error ? reason.stack : undefined;
    
    await storage.logError({
      errorType: 'UNHANDLED_PROMISE_REJECTION',
      errorCode: 'UNHANDLED_PROMISE_REJECTION',
      errorMessage,
      stackTrace,
      severity: 'CRITICAL',
      metadata: {
        promise: promise.toString(),
        reason: String(reason),
        processId: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date()
      },
      timestamp: new Date()
    });
  } catch (logError) {
    console.error('Failed to log unhandled promise rejection:', logError);
  }
});

// Handle process warnings
process.on('warning', async (warning: Error) => {
  console.warn('⚠️ PROCESS WARNING:', warning);
  
  try {
    await storage.logError({
      errorType: 'PROCESS_WARNING',
      errorCode: 'PROCESS_WARNING',
      errorMessage: warning.message,
      stackTrace: warning.stack,
      severity: 'WARNING',
      metadata: {
        warningName: warning.name,
        processId: process.pid,
        uptime: process.uptime(),
        timestamp: new Date()
      },
      timestamp: new Date()
    });
  } catch (logError) {
    console.error('Failed to log process warning:', logError);
  }
});

export { /* Export empty object to make this a module */ };
