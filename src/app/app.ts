import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SubmissionNotification } from './submission-notification';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SubmissionNotification],
  template: '<router-outlet /><app-submission-notification />',
})
export class App {}
