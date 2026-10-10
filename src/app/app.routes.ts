import { Routes } from '@angular/router';
import { Home } from './home';
import { Privacy } from './privacy/privacy';

export const routes: Routes = [
  {
    path: '',
    component: Home,
    title: 'Syoh Timofey'
  },
  {
    path: 'privacy',
    component: Privacy,
    title: 'Privacy | Syoh Timofey'
  },
  {
    path: '**',
    redirectTo: ''
  }
];
