import { Routes } from '@angular/router';
import { Home } from './home';

export const routes: Routes = [
  {
    path: '',
    component: Home,
    title: 'Syoh Timofey — Official Website',
    data: {
      canonicalPath: '/',
      description:
        'The official website of Syoh Timofey — music, brands, projects, latest updates and contact information.',
    },
  },
  {
    path: 'podcast',
    loadComponent: () => import('./podcast/podcast').then((module) => module.Podcast),
    title: 'Podcast | Syoh Timofey',
    data: {
      canonicalPath: '/podcast/',
      description:
        'The podcast by Syoh Timofey. Find listening platforms and learn how to apply as a guest, suggest a guest or propose a podcast collaboration.',
    },
  },
  {
    path: 'privacy',
    loadComponent: () => import('./privacy/privacy').then((module) => module.Privacy),
    title: 'Privacy | Syoh Timofey',
    data: {
      canonicalPath: '/privacy/',
      description:
        'Privacy information for syohtimofey.com, including hosting, locally hosted fonts, local interactions and contact features.',
    },
  },
  {
    path: '**',
    redirectTo: '',
  },
];
