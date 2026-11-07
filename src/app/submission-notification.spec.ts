import { TestBed } from '@angular/core/testing';
import { SubmissionNotificationService } from './submission-notification';

describe('SubmissionNotificationService', () => {
  let notification: SubmissionNotificationService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [SubmissionNotificationService] });
    notification = TestBed.inject(SubmissionNotificationService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('shows a success notification for four seconds and dismisses it automatically', () => {
    expect(notification.kind()).toBeNull();

    notification.show('contact');
    expect(notification.kind()).toBe('contact');
    vi.advanceTimersByTime(3_999);
    expect(notification.kind()).toBe('contact');

    vi.advanceTimersByTime(1);
    expect(notification.kind()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a notification and its pending timer when dismissed', () => {
    notification.show('podcast');
    vi.advanceTimersByTime(500);

    notification.dismiss();

    expect(notification.kind()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(4_000);
    expect(notification.kind()).toBeNull();
  });

  it('keeps a newer notification visible for its own full duration', () => {
    notification.show('contact');
    vi.advanceTimersByTime(3_000);
    notification.show('podcast');

    vi.advanceTimersByTime(1_000);
    expect(notification.kind()).toBe('podcast');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2_999);
    expect(notification.kind()).toBe('podcast');

    vi.advanceTimersByTime(1);
    expect(notification.kind()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the pending dismissal when its injector is destroyed', () => {
    const timersBefore = vi.getTimerCount();
    notification.show('contact');
    expect(vi.getTimerCount()).toBe(timersBefore + 1);

    TestBed.resetTestingModule();

    expect(vi.getTimerCount()).toBe(timersBefore);
  });
});
