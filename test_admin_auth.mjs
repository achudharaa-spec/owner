import { chromium } from '@playwright/test';

async function testAdminAuth() {
  console.log('🧪 Starting Admin Login Verification (Mobile + Custom Password + Strict .env Matching)...\n');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Test Case 1: Wrong ID / Wrong Password -> Must be rejected
  console.log('Case 1: Testing unauthorized credentials (e.g. hacker@gmail.com / wrongpass)...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'hacker@gmail.com');
  await page.fill('input[type="password"]', 'wrongpass');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  const errorVisible = await page.isVisible('.error-msg');
  const errorText = errorVisible ? await page.textContent('.error-msg') : '';
  console.log('  Error displayed:', errorText);
  if (errorVisible && errorText.includes('Access Denied')) {
    console.log('  ✅ Case 1 Passed: Unauthorized login rejected successfully!\n');
  } else {
    throw new Error('Case 1 Failed: Unauthorized login was not properly rejected');
  }

  // Test Case 2: Matching custom email from .env with wrong password -> Must be rejected
  console.log('Case 2: Testing valid email (achudharaa@gmail.com) with wrong password...');
  await page.fill('input[type="text"]', 'achudharaa@gmail.com');
  await page.fill('input[type="password"]', 'badPassword123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1000);

  const error2 = await page.textContent('.error-msg');
  console.log('  Error displayed:', error2);
  if (error2.includes('Incorrect password')) {
    console.log('  ✅ Case 2 Passed: Wrong password rejected successfully!\n');
  } else {
    throw new Error('Case 2 Failed: Wrong password was not rejected');
  }

  // Test Case 3: Valid Visiting Card Mobile Number (98426 86264) + Custom Password (SriSuryaTex@2026) -> Must Succeed!
  console.log('Case 3: Testing Visiting Card Mobile Number (98426 86264) + Custom Password (SriSuryaTex@2026)...');
  await page.fill('input[type="text"]', '98426 86264');
  await page.fill('input[type="password"]', 'SriSuryaTex@2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Check if Admin Dashboard (Header / Catalog) is loaded
  const hasCatalog = await page.isVisible('.top-nav, .brand-titles, .main-layout');
  const pageHeader = await page.textContent('.brand-titles h1').catch(() => '');
  console.log('  Admin Portal Header:', pageHeader);

  await page.screenshot({ path: 'C:/Users/dhamo/.gemini/antigravity-ide/brain/610f8254-f612-4fd1-a9bd-5c9979a57b43/admin_dashboard_logged_in.png' });

  if (hasCatalog && pageHeader.includes('SRI SURYA TEX')) {
    console.log('  ✅ Case 3 Passed: Successfully logged in with Visiting Card Mobile + Custom Password!\n');
  } else {
    throw new Error('Case 3 Failed: Admin Dashboard did not load after valid mobile login');
  }

  // Test Case 4: Verify Logout and Re-Login with Custom Email (achudharaa@gmail.com)
  console.log('Case 4: Testing Logout and Re-Login with .env Custom Email (achudharaa@gmail.com)...');
  await page.click('.btn-logout-pill');
  await page.waitForTimeout(1000);

  const backOnLogin = await page.isVisible('.login-card');
  console.log('  Logged out back to login form:', backOnLogin);

  await page.fill('input[type="text"]', 'achudharaa@gmail.com');
  await page.fill('input[type="password"]', 'SriSuryaTex@2026');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  const hasCatalogAgain = await page.isVisible('.top-nav, .brand-titles, .main-layout');
  if (hasCatalogAgain) {
    console.log('  ✅ Case 4 Passed: Successfully logged in with .env Custom Email + Custom Password!\n');
  } else {
    throw new Error('Case 4 Failed: Re-login with custom email did not work');
  }

  await browser.close();
  console.log('🎉 ALL ADMIN LOGIN VALIDATION TESTS PASSED CLEANLY!');
}

testAdminAuth().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
