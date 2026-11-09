import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { MHALandingScreen } from './MHALandingScreen.js';
import { ScreeningVaccinationScreen } from './ScreeningVaccinationScreen.js';

export class ActivityScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertActivityHeader(): Promise<this> {
    await this.assertTextEquals(
      await this.element("//*[@resource-id='txtactivities_001']", "//*[@name='txtactivities_001']"),
      'Activities'
    );
    return this;
  }

  async openMHAFeedcard(): Promise<MHALandingScreen> {
    await this.scrollAndClick("//*[@resource-id='Mental Health Assessment Tracking Card_2']", "//*[@name='Mental Health Assessment Tracking Card_2']", 7);
    return new MHALandingScreen(this.session);
  }

  async assertMHAInitPoints(): Promise<this> {
    await this.assertTextEquals(
      await this.element("//*[@resource-id='points_tracker_text_Mental Health Assessment Tracking Card_2']", "//*[@name='points_tracker_text_Mental Health Assessment Tracking Card_2']"),
      '0/600 POINTS'
    );
    return this;
  }

  async assertMHAInitText(): Promise<this> {
    await this.assertTextEquals(
      await this.element("//*[@resource-id='activity_card_sub_text_Mental Health Assessment Tracking Card_2']", "//*[@name='activity_card_sub_text_Mental Health Assessment Tracking Card_2']"),
      'Takes <<less than 5>> minutes to complete'
    );
    return this;
  }

  async openScreeningVaccinationFeedcard(): Promise<ScreeningVaccinationScreen> {
    await this.scrollAndClick("//*[@resource-id='Screenings Vaccinations Tracking_2']", "//*[@name='Screenings Vaccinations Tracking_2']", 15);
    return new ScreeningVaccinationScreen(this.session);
  }

  async assertSnVInitPoints(): Promise<ScreeningVaccinationScreen> {
    await this.assertTextEquals(
      await this.element("//*[@resource-id='points_tracker_text_Screenings Vaccinations Tracking_2']", "//*[@name='points_tracker_text_Screenings Vaccinations Tracking_2']"),
      '0/4,000 POINTS'
    );
    return new ScreeningVaccinationScreen(this.session);
  }

  async assertSnVInitText(): Promise<ScreeningVaccinationScreen> {
    await this.assertTextEquals(
      await this.element("//*[@resource-id='activity_card_sub_text_Screenings Vaccinations Tracking_2']", "//*[@name='activity_card_sub_text_Screenings Vaccinations Tracking_2']"),
      'Submit completed form from healthcare provider'
    );
    return new ScreeningVaccinationScreen(this.session);
  }
}
