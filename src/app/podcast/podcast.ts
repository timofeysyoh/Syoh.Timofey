import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  Injector,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PodcastApplication } from './application/podcast-application';

@Component({
  selector: 'app-podcast',
  imports: [RouterLink, PodcastApplication],
  templateUrl: './podcast.html',
  styleUrl: './podcast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Podcast {
  private readonly injector = inject(Injector);
  @ViewChild('applicationTrigger') private applicationTrigger?: ElementRef<HTMLButtonElement>;

  @ViewChild('pendingApplicationClose')
  set pendingApplicationClose(reference: ElementRef<HTMLButtonElement> | undefined) {
    if (!reference) return;
    afterNextRender(() => {
      if (this.applicationOpen && reference.nativeElement.isConnected) {
        reference.nativeElement.focus();
      }
    }, { injector: this.injector });
  }

  applicationOpen = false;

  openApplication(): void {
    this.applicationOpen = true;
  }

  closeApplication(): void {
    this.applicationOpen = false;
    afterNextRender(() => {
      if (!this.applicationOpen) this.applicationTrigger?.nativeElement.focus();
    }, { injector: this.injector });
  }

  trapPendingFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = event.currentTarget as HTMLElement;
    const elements = Array.from(panel.querySelectorAll<HTMLElement>('button, a[href]'));
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = panel.ownerDocument.activeElement;
    if (!first || !last) return;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  closeApplicationWithEscape(event: Event): void {
    if (!this.applicationOpen || event.defaultPrevented) return;
    event.preventDefault();
    this.closeApplication();
  }
}
