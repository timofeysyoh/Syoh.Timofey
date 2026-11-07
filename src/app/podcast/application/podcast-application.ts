import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
  Injector,
  output,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResizableMessage } from '../../resizable-message.directive';
import { FormSubmission } from '../../form-submission';

type SocialNetwork = {
  value: string;
  label: string;
  icon: string;
};

@Component({
  selector: 'app-podcast-application',
  imports: [RouterLink, ResizableMessage],
  providers: [FormSubmission],
  templateUrl: './podcast-application.html',
  styleUrl: './podcast-application.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastApplication {
  private readonly injector = inject(Injector);
  @ViewChild('applicationDialog') private applicationDialog?: ElementRef<HTMLElement>;
  @ViewChild('applicationFirstField') private applicationFirstField?: ElementRef<HTMLInputElement>;
  @ViewChild('socialField') private socialField?: ElementRef<HTMLElement>;
  @ViewChild('socialProfileField') private socialProfileField?: ElementRef<HTMLInputElement>;
  @ViewChild('socialNetworkTrigger') private socialNetworkTrigger?: ElementRef<HTMLButtonElement>;
  @ViewChild('applicationMessageField') private applicationMessageField?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('verificationContainer') private verificationContainer?: ElementRef<HTMLElement>;

  readonly delivery = inject(FormSubmission);
  readonly socialNetworks: readonly SocialNetwork[] = [
    { value: 'youtube', label: 'YouTube', icon: '/youtube-color-svgrepo-com.svg' },
    { value: 'instagram', label: 'Instagram', icon: '/instagram-2016-logo-svgrepo-com.svg' },
    { value: 'tiktok', label: 'TikTok', icon: '/tiktok-svgrepo-com.svg' },
  ];
  socialNetwork = this.socialNetworks[0];
  socialMenuOpen = false;
  readonly closeRequested = output<void>();
  messageLength = 0;

  constructor() {
    afterNextRender(() => {
      this.applicationFirstField?.nativeElement.focus();
    });
  }

  closeApplication(): void {
    this.closeRequested.emit();
  }

  trapApplicationFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const panel = this.applicationDialog?.nativeElement;
    if (!panel) return;

    const elements = Array.from(panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden'));
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

  toggleSocialMenu(): void {
    if (this.socialMenuOpen) {
      this.closeSocialMenu();
      return;
    }

    this.socialMenuOpen = true;
    afterNextRender(() => {
      if (!this.socialMenuOpen) return;
      const field = this.socialField?.nativeElement;
      field?.querySelector('#podcast-social-options')
        ?.scrollIntoView?.({ block: 'nearest' });
      field?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
        ?.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  selectSocialNetwork(network: SocialNetwork): void {
    this.socialNetwork = network;
    this.closeSocialMenu(true);
  }

  closeSocialMenu(restoreFocus = false): void {
    this.socialMenuOpen = false;
    if (restoreFocus) this.socialNetworkTrigger?.nativeElement.focus({ preventScroll: true });
  }

  handleSocialKeydown(event: KeyboardEvent): void {
    if (!this.socialMenuOpen) {
      if (event.target === this.socialNetworkTrigger?.nativeElement &&
          (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        this.toggleSocialMenu();
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeSocialMenu(true);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.closeSocialMenu();
      const next = event.shiftKey ? this.socialProfileField : this.applicationMessageField;
      next?.nativeElement.focus();
      return;
    }

    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(this.socialField?.nativeElement
      .querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    if (!options.length) return;
    const current = options.indexOf(options[0].ownerDocument.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
      (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[index].focus({ preventScroll: true });
  }

  @HostListener('document:pointerdown', ['$event'])
  @HostListener('document:focusin', ['$event'])
  dismissSocialMenuOutside(event: Event): void {
    if (this.socialMenuOpen && !this.socialField?.nativeElement.contains(event.target as Node)) {
      this.closeSocialMenu();
    }
  }

  updateMessageLength(event: Event): void {
    this.messageLength = (event.target as HTMLTextAreaElement).value.length;
  }

  submitApplication(event: Event): void {
    event.preventDefault();
    if (this.verificationContainer) {
      void this.delivery.submit(event.target as HTMLFormElement, 'podcast', this.verificationContainer.nativeElement);
    }
  }
}
