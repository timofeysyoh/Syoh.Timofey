import { Routes } from '@angular/router';
import { Home } from './home';
import { Privacy } from './privacy/privacy';

export const routes: Routes = [
  {
    path: '',
    component: Home,
    title: 'Syoh Timofey — Official Website',
    data: {
      canonicalPath: '/',
      description: 'The official website of Syoh Timofey — music, brands, projects, latest updates and contact information.'
    }
  },
  {
    path: 'privacy',
    component: Privacy,
    title: 'Privacy | Syoh Timofey',
    data: {
      canonicalPath: '/privacy/',
      description: 'Privacy information for syohtimofey.com, including hosting, Google Fonts, local interactions and contact features.'
    }
  },
  {
    path: '**',
    redirectTo: ''
  }
];
