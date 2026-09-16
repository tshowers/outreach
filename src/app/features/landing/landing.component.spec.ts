import { LandingComponent } from './landing.component';

describe('LandingComponent', () => {
  it('exposes the landing page proof points and FAQs', () => {
    const component = new LandingComponent();

    expect(component.metrics.length).toBe(4);
    expect(component.metrics.every(metric => metric.value && metric.label && metric.detail)).toBeTrue();
    expect(component.faqs.length).toBeGreaterThan(0);
  });
});
