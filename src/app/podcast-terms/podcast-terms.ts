import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-podcast-terms',
  imports: [RouterLink],
  templateUrl: './podcast-terms.html',
  styleUrls: ['../privacy/privacy.scss', './podcast-terms.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PodcastTerms {}
