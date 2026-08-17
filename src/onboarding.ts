import { JsonStorage } from './reader/storage';

interface OnboardingState {
  headerHintShown: boolean;
}

export class OnboardingHints {
  private readonly storage = new JsonStorage<OnboardingState>(
    'chitalka:onboarding:v1',
    { headerHintShown: false },
  );
  private readonly state = this.storage.read();

  claimHeaderHint(): boolean {
    if (this.state.headerHintShown) return false;
    this.state.headerHintShown = true;
    this.storage.write(this.state);
    return true;
  }
}
