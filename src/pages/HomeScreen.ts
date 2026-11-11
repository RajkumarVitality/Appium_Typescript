import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import { ProfileScreen } from './ProfileScreen.js';
import { ActivityScreen } from './ActivityScreen.js';
import { HealthScreen } from './HealthScreen.js';

export class HomeScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertGreetingVisible(): Promise<void> {
    await this.assertTextContains(
      await this.element("//*[@resource-id='vg_text_header_greeting']", "//*[@name='vg_text_header_greeting']"),
      'Good morning',
      'Good afternoon',
      'Good evening'
    );
  }

  dismissNotificationPopup(): Promise<void> {
    return this.click("//*[@resource-id='ctrl_btnok_001']", "//*[@name='ctrl_btnok_001']");
  }

  acceptPermissionDialog(): Promise<void> {
    return this.click("//*[@text='Allow']", "//*[@name='ctrl_btnallow_001']");
  }

  async openProfileTab(): Promise<ProfileScreen> {
    await this.click("//*[@resource-id='vg_icon_bottom_nav_bar_circle_user']", "//*[@name='vg_icon_bottom_nav_bar_circle_user']");
    return new ProfileScreen(this.session);
  }

  async openActivityTab(): Promise<ActivityScreen> {
    await this.click("//*[@resource-id='vg_icon_bottom_nav_bar_clip_board_check']", "//*[@name='vg_icon_bottom_nav_bar_clip_board_check']");
    return new ActivityScreen(this.session);
  }

  async openHealthTab(): Promise<HealthScreen> {
    await this.click("//*[@resource-id='vg_icon_bottom_nav_bar_heart']", "//*[@name='vg_icon_bottom_nav_bar_heart']");
    return new HealthScreen(this.session);
  }

  async openRewardTab(): Promise<ActivityScreen> {
    await this.click("//*[@resource-id='vg_icon_bottom_nav_bar_gift_card']", "//*[@name='vg_icon_bottom_nav_bar_gift_card']");
    return new ActivityScreen(this.session);
  }
}
