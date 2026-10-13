import { executionReporter } from '../../src/utils/ExecutionReporter.js';
import { assertTestAccountReady, testAccounts } from '../helpers/user_helpers/TestUser.js';
import { loginToHome } from '../helpers/genericFlow.js';

describe('mental health assessment privacy consent cancellation', () => {
  before('verify pre-session member account', assertTestAccountReady);

  it('returns to MHA landing when the privacy notice is cancelled', async () => {
    const { homeScreen } = await loginToHome(testAccounts.member);
    const activityScreen = await homeScreen.openActivityTab();
    await activityScreen.assertActivityHeader();
    const landingScreen = await activityScreen.openMHAFeedcard();
    await landingScreen.assertMHAScreenHeader();
    await landingScreen.assertMHAInitPoints();
    await landingScreen.clickMHAStartButton();
    await landingScreen.assertDataPrivacyScreenVisible();

    await landingScreen.clickDataPrivacyBackButton();

    await landingScreen.assertMHAScreenHeader();
    await landingScreen.assertMHAInitPoints();
    if (!await landingScreen.isVisibleMHAStartButton()) {
      throw new Error('MHA Start must remain available after cancelling the privacy notice.');
    }
    executionReporter.log('Cancelled the MHA privacy notice with its Back button; assessment remained unstarted.');
    await executionReporter.captureScreenshot('mha-privacy-notice-cancelled');
  });
});
