import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';

export class MHALandingScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertMHAScreenHeader(): Promise<void> {
    await this.assertTextEquals(
      await this.element("//*[@resource-id='txtmentalwellbeingassessment_001']", "//*[@name='txtmentalwellbeingassessment_001']"),
      'Mental health assessment'
    );
  }

  async assertMHAInitPoints(): Promise<void> {
    await this.assertTextEquals(await this.element("//*[@resource-id='txtpoints_001']", "//*[@name='txtpoints_001']"), '0/600 POINTS');
  }

  async assertTimeInit(): Promise<void> {
    await this.assertTextEquals(await this.element("//*[@resource-id='txttime005']", "//*[@name='txttime005']"), 'Takes 5 minutes to complete');
  }

  async isVisibleMHAStartButton(): Promise<boolean> {
    return this.isVisible(
      "//*[@resource-id='btnstartassessment_001'] | //*[@resource-id='btn_ctrl_btnstartassessment_001']",
      "//*[@name='btnstartassessment_001'] | //*[@name='btn_ctrl_btnstartassessment_001']"
    );
  }

  clickMHAStartButton(): Promise<void> {
    return this.click(
      "//*[@resource-id='btnstartassessment_001'] | //*[@resource-id='btn_ctrl_btnstartassessment_001']",
      "//*[@name='btnstartassessment_001'] | //*[@name='btn_ctrl_btnstartassessment_001']"
    );
  }

  clickIundertandOnDataPrivacyScreen(): Promise<void> {
    return this.click("//*[@resource-id='btn_vg_button_i_understand']", "//*[@name='btn_vg_button_i_understand']");
  }

  async assertDataPrivacyScreenVisible(): Promise<void> {
    await this.element(
      "//*[@resource-id='btn_vg_button_i_understand']",
      "//*[@name='btn_vg_button_i_understand']"
    );
  }

  clickDataPrivacyBackButton(): Promise<void> {
    return this.click("//*[@resource-id='vg_back_button']", "//*[@name='vg_back_button']");
  }

  async assertLowRiskPointsUpdated(): Promise<void> {
    await this.assertTextContains(await this.element("//*[@resource-id='txtpoints_001']", "//*[@name='txtpoints_001']"), '300/600 POINTS');
  }

  async assertCompltedDate(): Promise<void> {
    await this.assertTextContains(await this.element("//*[@resource-id='txtcompleteddate_001']", "//*[@name='txtcompleteddate_001']"), 'Completed:');
  
  }
  async assertRiskType(expectedRisk: 'Low risk' | 'Moderate risk' | 'High risk'): Promise<void> {
    await this.assertTextContains(await this.element("//*[@resource-id='vg_risk_text']", "//*[@name='vg_risk_text']"), expectedRisk);
  }
}
  