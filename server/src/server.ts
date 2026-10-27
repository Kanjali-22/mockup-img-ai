import 'dotenv/config';
import app from './app';
import { getProviderStatus } from './services/imageProvider';

const PORT = parseInt(process.env.PORT || '3005', 10);

const server = app.listen(PORT, () => {
  console.log(`🚀 Mockup Studio AI server running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);

  const status = getProviderStatus();
  if (status.conflict) {
    console.warn('⚠️  Conflicting provider configuration: both OPENAI_API_KEY and STABILITY_API_KEY are set.');
    console.warn('   Please configure exactly one provider key in server/.env.');
  } else if (status.activeProvider === 'openai') {
    console.log(`✅ OpenAI API key configured (${status.keyHint}) - Active Provider: openai`);
  } else if (status.activeProvider === 'stability') {
    console.log(`✅ Stability AI API key configured (${status.keyHint}) - Active Provider: stability`);
  } else {
    console.warn('⚠️  No AI image generation provider configured. Set OPENAI_API_KEY or STABILITY_API_KEY in server/.env.');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

export default server;
