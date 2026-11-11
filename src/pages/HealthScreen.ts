import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';
import {ActivityScreen} from "./ActivityScreen.js";

export class HealthScreen extends BaseScreen {
    constructor(session: MobileSession) {
        super(session);
    }

    async assertHealthHeader(): Promise<this> {
        await this.assertTextEquals(
            await this.element("//*[@resource-id='txthealth_001']", "//*[@name='txthealth_001']"),
            'Health'
        );
        return this;
    }
    async scrollTillSeeAllActivity(): Promise<ActivityScreen> {
        await this.scrollAndClick("//*[@resource-id='btn_ctrl_btnseeallactivities_001']", "//*[@name='btn_ctrl_btnseeallactivities_001']", 15);
        return new ActivityScreen(this.session);
    }

}
