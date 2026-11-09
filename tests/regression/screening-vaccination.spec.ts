import { executionReporter } from '../../src/utils/ExecutionReporter.js';
import { ActivityScreen } from '../../src/pages/ActivityScreen.js';
import { HomeScreen } from '../../src/pages/HomeScreen.js';
import { ScreeningVaccinationScreen } from '../../src/pages/ScreeningVaccinationScreen.js';
import { completeLogin, loginWithUsername } from '../helpers/genericFlow.js';
import { assertTestAccountReady, testAccounts } from '../helpers/user_helpers/TestUser.js';

describe('screening vaccination form', () => {
  before('verify pre-session member account', assertTestAccountReady);

  it('requires proof and submits the vaccination form', async () => {
    executionReporter.log('Logging in and navigating to the activity feed.');
    const { session, loginScreen } = await loginWithUsername(testAccounts.member);
    await completeLogin(loginScreen);

    const homeScreen = new HomeScreen(session);
    if (!session.isIOS) {
      await homeScreen.dismissNotificationPopup();
      await homeScreen.acceptPermissionDialog();
    }
    await homeScreen.assertGreetingVisible();
    const activityScreen: ActivityScreen = await homeScreen.openActivityTab();
    await activityScreen.assertActivityHeader();
    const form: ScreeningVaccinationScreen = await activityScreen.openScreeningVaccinationFeedcard();
    executionReporter.log('Opened the screening vaccination form.');
    await form.openSubmissionForm();
    await form.acceptDataPrivacyNotice();
    await form.assertFormLoaded();
    await form.assertProofUploadControlVisible();
    executionReporter.log('Validated that the proof upload control is visible.');
    await form.selectFluType();
    executionReporter.log('Selected Flu as the screening vaccination type.');
    await form.selectCurrentDate();
    executionReporter.log('Selected the current date.');

    await form.submitForm();
    await form.assertSubmissionBlockedWithoutProof();
    executionReporter.log('Confirmed submission is blocked when proof is missing.');

    await form.uploadPngFromDevice();
    executionReporter.log('Selected proof from the device.');
    await form.submitForm();
    executionReporter.log('Submitted the screening vaccination form.');
    await form.assertSubmissionSuccessful();
    await executionReporter.captureScreenshot('screening-vaccination-submitted');
    await form.tapDone();
  });
});
