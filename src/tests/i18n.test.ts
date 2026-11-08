import { describe, it, expect } from 'vitest';
import { translate } from '@/app/i18n';

describe('EN/RU translation layer', () => {
  it('English mode returns text unchanged', () => {
    expect(translate('Sign in', 'en')).toBe('Sign in');
  });
  it('translates exact strings and keeps surrounding spaces', () => {
    expect(translate('  Sign in ', 'ru')).toBe('  Войти ');
  });
  it('translates generated sentences with names and amounts', () => {
    expect(
      translate('We identified $2,400.00 spent at Google Ads (advertising and marketing). What portion of this expenditure was directly for business use?', 'ru')
    ).toBe('Мы нашли расходы $2,400.00 в «Google Ads» (реклама и маркетинг). Какая часть из них — для бизнеса?');
    expect(translate('[confirmed] 5. Taxable income', 'ru')).toBe('[подтверждённый] 5. Налогооблагаемый доход');
    expect(translate('4. AI Tax Interview (11 Pending)', 'ru')).toBe('4. Вопросы (11 без ответа)');
  });
  it('leaves unknown text (merchant names) alone', () => {
    expect(translate('Whole Foods Market', 'ru')).toBe('Whole Foods Market');
  });
});
