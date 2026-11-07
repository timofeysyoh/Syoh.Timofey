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
    path: 'podcast/terms',
    loadComponent: () => import('./podcast-terms/podcast-terms').then((module) => module.PodcastTerms),
    title: 'Podcast Terms | Syoh Timofey',
    data: {
      canonicalPath: '/podcast/terms/',
      description:
        'Podcast participation and booking terms: adult guests, paid and unpaid conversations, recording permissions, cancellations and mandatory rights.',
    },
  },
  {
    path: 'podcast',
    loadComponent: () => import('./podcast/podcast').then((module) => module.Podcast),
    title: 'Podcast | Syoh Timofey',
    data: {
      canonicalPath: '/podcast/',
      description:
        'The podcast by Syoh Timofey. Explore guest appearances, conversation requests and podcast collaborations.',
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
    path: 'legal',
    loadComponent: () => import('./legal-notice/legal-notice').then((module) => module.LegalNotice),
    title: 'Legal Notice | Syoh Timofey',
    data: {
      canonicalPath: '/legal/',
      description:
        'Information about Syoh Timofey’s personal creative website, its purpose, personal views, political activity and separate service terms.',
    },
  },
  {
    path: '**',
    redirectTo: '',
  },
];
