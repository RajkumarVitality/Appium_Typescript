import assert from 'node:assert/strict';
import { browser } from '@wdio/globals';
import { deflateSync } from 'node:zlib';
import { MobileSession } from '../utils/Mobile Utils_Scrolll_Xpath_Timeout.js';
import { BaseScreen } from './BaseScreen.js';

function pngChunk(type: string, data: Buffer): Buffer {
  const typeData = Buffer.from(type, 'ascii');
  const chunkData = Buffer.concat([typeData, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(chunkData));
  return Buffer.concat([length, chunkData, checksum]);
}

function crc32(data: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of data) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0);
    }
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

function createProofPngBase64(): string {
  const width = 320;
  const height = 240;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height);

  for (let row = 0; row < height; row++) {
    const rowOffset = row * stride;
    pixels[rowOffset] = 0;
    for (let column = 0; column < width; column++) {
      const border = row < 8 || row >= height - 8 || column < 8 || column >= width - 8;
      const header = row >= 32 && row < 72;
      const pixelOffset = rowOffset + 1 + column * 4;
      pixels[pixelOffset] = border || header ? 48 : 245;
      pixels[pixelOffset + 1] = border || header ? 112 : 248;
      pixels[pixelOffset + 2] = border || header ? 86 : 245;
      pixels[pixelOffset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0))
  ]).toString('base64');
}

const locators = {
  formType: {
    android: "//*[@text='Select type' or @content-desc='Select type']",
    ios: "//*[@name='Select type' or @label='Select type']"
  },
  formDate: {
    android: "//*[contains(@text, 'Date') or contains(@content-desc, 'Date')]",
    ios: "//*[contains(@name, 'Date') or contains(@label, 'Date')]"
  },
  uploadControl: {
    android: "//*[@resource-id='VGUpload' or @resource-id='snv_upload_proof_image']",
    ios: "//*[@name='VGUpload' or @name='snv_upload_proof_image']"
  },
  proofUploadControl: {
    android: "//*[@resource-id='VGUpload' or @resource-id='snv_upload_proof_image']",
    ios: "//*[@name='VGUpload' or @label='VGUpload' or @name='snv_upload_proof_image' or @label='snv_upload_proof_image']"
  },
  openSubmissionForm: {
    android: "//*[@text='Submit form' or @content-desc='Submit form']",
    ios: "//*[@name='Submit form' or @label='Submit form']"
  },
  dataPrivacyUnderstand: {
    android: "//*[@text='I understand' or @content-desc='I understand']",
    ios: "//*[@name='I understand' or @label='I understand']"
  },
  fluOption: {
    android: "//*[@text='Flu' or @content-desc='Flu']",
    ios: "//*[@name='Flu' or @label='Flu']"
  },
  datePickerOpen: {
    android: "//*[contains(@text, 'Date') or contains(@content-desc, 'Date')]",
    ios: "//*[@name='onTapSuffixIcon']"
  },
  currentDay: (day: string) => ({
    android: `//*[@text='${day}' or @content-desc='${day}' or (contains(@content-desc, '${day},') and contains(@content-desc, 'Today'))]`,
    ios: `//*[@name='${day}' or @label='${day}' or @value='${day}' or (contains(@name, '${day},') and contains(@name, 'Today')) or (contains(@label, '${day},') and contains(@label, 'Today'))]`
  }),
  dateConfirm: {
    android: "//*[@text='OK' or @content-desc='OK' or @text='Done' or @content-desc='Done' or @text='Select' or @content-desc='Select']",
    ios: "//*[@name='Done' or @label='Done' or @name='Select' or @label='Select']"
  },
  datePickerScrim: {
    android: "//*",
    ios: "//*[@name='Scrim' or @label='Scrim']"
  },
  uploadButton: {
    android: "//*[@resource-id='ctrl_btnupload_001' or @content-desc='Upload']",
    ios: "//*[@name='ctrl_btnupload_001' or @label='Upload']"
  },
  selectPdf: {
    android: "//*[@text='Select PDF' or @content-desc='Select PDF']",
    ios: "//*[@name='Select PDF' or @label='Select PDF']"
  },
  pdfFile: {
    android: "//*[contains(translate(@text, 'PDF', 'pdf'), '.pdf') or contains(translate(@content-desc, 'PDF', 'pdf'), '.pdf')]",
    ios: "//*[contains(translate(@name, 'PDF', 'pdf'), '.pdf') or contains(translate(@label, 'PDF', 'pdf'), '.pdf')]"
  },
  galleryOption: {
    android: "//*[contains(translate(@name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'gallery') or contains(translate(@label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'gallery') or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'gallery')]",
    ios: "//*[contains(translate(@name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'gallery') or contains(translate(@label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'gallery') or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'gallery')]"
  },
  firstGalleryImage: {
    android: "(//XCUIElementTypeImage[contains(@name, 'Photo') or contains(@label, 'Photo')])[1]",
    ios: "(//XCUIElementTypeImage[contains(@name, 'Photo') or contains(@label, 'Photo')])[1]"
  },
  showRoots: {
    android: "//*[@content-desc='Show roots' or @resource-id='com.google.android.documentsui:id/home']",
    ios: "//*[@name='Browse' or @label='Browse']"
  },
  downloads: {
    android: "//*[@text='Downloads' or @content-desc='Downloads']",
    ios: "//*[@name='Downloads' or @label='Downloads']"
  },
  proofPng: {
    android: "//*[@text='screening-proof.png' or @content-desc='screening-proof.png']",
    ios: "//*[@name='screening-proof.png' or @label='screening-proof.png']"
  },
  submitButton: {
    android: "//*[@text='Submit' or @content-desc='Submit' or @text='Submit proof' or @content-desc='Submit proof']",
    ios: "//*[@name='Submit' or @label='Submit' or @name='Submit proof' or @label='Submit proof']"
  },
  submissionSuccess: {
    android: "//*[contains(translate(@text, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proof submitted successfully') or contains(translate(@content-desc, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proof submitted successfully')]",
    ios: "//*[contains(translate(@name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proof submitted successfully') or contains(translate(@label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'proof submitted successfully')]"
  },
  doneButton: {
    android: "//*[@text='Done' or @content-desc='Done']",
    ios: "//*[@name='Done' or @label='Done']"
  }
} as const;

export class ScreeningVaccinationScreen extends BaseScreen {
  constructor(session: MobileSession) {
    super(session);
  }

  async assertFormLoaded(): Promise<void> {
    assert.ok(await this.isVisible(locators.formType.android, locators.formType.ios), 'Screening vaccination form type field was not displayed');
    assert.ok(await this.isVisible(locators.formDate.android, locators.formDate.ios), 'Screening vaccination form date field was not displayed');
    assert.ok(await this.isVisible(locators.uploadControl.android, locators.uploadControl.ios), 'Screening vaccination form upload control was not displayed');
  }

  openSubmissionForm(): Promise<void> {
    return this.click(locators.openSubmissionForm.android, locators.openSubmissionForm.ios);
  }

  async acceptDataPrivacyNotice(): Promise<void> {
    if (await this.isVisible(locators.dataPrivacyUnderstand.android, locators.dataPrivacyUnderstand.ios)) {
      await this.click(locators.dataPrivacyUnderstand.android, locators.dataPrivacyUnderstand.ios);
    }
  }

  async assertProofUploadControlVisible(): Promise<void> {
    assert.ok(
      await this.isVisible(locators.proofUploadControl.android, locators.proofUploadControl.ios),
      'Proof upload control was not visible on the screening vaccination form'
    );
  }

  async selectFluType(): Promise<void> {
    await this.click(locators.formType.android, locators.formType.ios);
    await this.click(locators.fluOption.android, locators.fluOption.ios);
  }

  async selectCurrentDate(): Promise<void> {
    await this.click(locators.datePickerOpen.android, locators.datePickerOpen.ios);

    const today = String(new Date().getDate());
    const dayLocator = locators.currentDay(today);
    assert.ok(await this.isVisible(dayLocator.android, dayLocator.ios), 'Current day was not available in the date picker');
    await this.click(dayLocator.android, dayLocator.ios);

    if (await this.isVisible(locators.dateConfirm.android, locators.dateConfirm.ios)) {
      await this.click(locators.dateConfirm.android, locators.dateConfirm.ios);
    } else if (this.session.isIOS) {
      await this.click(locators.datePickerScrim.android, locators.datePickerScrim.ios);
    }
  }

  async uploadPdfFromDevice(): Promise<void> {
    await this.scrollAndClick(locators.uploadButton.android, locators.uploadButton.ios, 5);
    await this.click(locators.selectPdf.android, locators.selectPdf.ios);
    await (await this.element(locators.pdfFile.android, locators.pdfFile.ios)).click();
  }

  private async uploadImageFromGallery(): Promise<void> {
    await this.scrollAndClick(locators.uploadButton.android, locators.uploadButton.ios, 5);
    assert.ok(await this.isVisible(locators.galleryOption.android, locators.galleryOption.ios), 'The iOS upload options did not expose a gallery choice');
    await this.click(locators.galleryOption.android, locators.galleryOption.ios);
    assert.ok(await this.isVisible(locators.firstGalleryImage.android, locators.firstGalleryImage.ios), 'No selectable photos were visible in the iOS gallery');
    await this.click(locators.firstGalleryImage.android, locators.firstGalleryImage.ios);
  }

  async uploadPngFromDevice(): Promise<void> {
    if (this.session.isIOS) {
      await this.uploadImageFromGallery();
      return;
    }

    await browser.pushFile('/sdcard/Download/screening-proof.png', createProofPngBase64());
    await this.scrollAndClick(locators.uploadButton.android, locators.uploadButton.ios, 5);
    await this.click(locators.selectPdf.android, locators.selectPdf.ios);
    await this.click(locators.showRoots.android, locators.showRoots.ios);
    await this.click(locators.downloads.android, locators.downloads.ios);
    await this.click(locators.proofPng.android, locators.proofPng.ios);
  }

  submitForm(): Promise<void> {
    return this.scrollAndClick(locators.submitButton.android, locators.submitButton.ios, 8);
  }

  async assertSubmissionSuccessful(): Promise<void> {
    assert.ok(
      await this.isVisible(locators.submissionSuccess.android, locators.submissionSuccess.ios),
      'Proof submission success message was not displayed'
    );
  }

  async assertSubmissionBlockedWithoutProof(): Promise<void> {
    assert.equal(
      await this.isVisible(locators.submissionSuccess.android, locators.submissionSuccess.ios),
      false,
      'Proof submission must not succeed without an uploaded proof'
    );
    await this.assertFormLoaded();
  }

  tapDone(): Promise<void> {
    return this.click(locators.doneButton.android, locators.doneButton.ios);
  }
}
