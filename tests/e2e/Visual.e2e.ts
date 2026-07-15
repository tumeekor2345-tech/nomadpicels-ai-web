import { expect, takeSnapshot, test } from '@chromatic-com/playwright';

test.describe('Visual testing', () => {
  test.describe('Static pages', () => {
    test('should take screenshot of the homepage', async ({ page }, testInfo) => {
      await page.goto('/');

      await expect(page.getByText('Секундын дотор гайхалтай')).toBeVisible();

      await takeSnapshot(page, testInfo);
    });
  });
});
