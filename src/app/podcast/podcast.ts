import { ChangeDetectionStrategy, Component, ElementRef, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PODCAST_CONFIG } from './podcast.config';

@Component({
  selector: 'app-podcast',
  imports: [RouterLink],
  templateUrl: './podcast.html',
  styleUrl: './podcast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Podcast {
  @ViewChild('applicationTitle') private applicationTitle?: ElementRef<HTMLElement>;

  readonly config = PODCAST_CONFIG;
  // Enable applications only when a real message-delivery transport is connected.
  readonly applicationDeliveryAvailable = false;
  messageLength = 0;
  applicationNotice = '';

  goToApplication(): void {
    const title = this.applicationTitle?.nativeElement;
    if (!title) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    title.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    title.focus({ preventScroll: true });
  }

  updateMessageLength(event: Event): void {
    this.messageLength = (event.target as HTMLTextAreaElement).value.length;
  }

  submitApplication(event: Event): void {
    event.preventDefault();
    this.applicationNotice = 'Applications are not open yet. Nothing has been sent.';
  }
}
