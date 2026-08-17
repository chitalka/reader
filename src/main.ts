import { ChitalkaApp } from './app';
import { registerServiceWorker } from './pwa';
import { dismissInitialSplash } from './splash';
import './style.css';

registerServiceWorker();

async function startApplication(): Promise<void> {
  try {
    const app = new ChitalkaApp();
    await app.start();
  } finally {
    dismissInitialSplash();
  }
}

void startApplication();
