export interface PodcastConfig {
  readonly applePodcastsUrl: string | null;
  readonly youtubeUrl: string | null;
  readonly applicationEmail: string | null;
}

// Add the podcast's own destinations when they are available.
export const PODCAST_CONFIG: PodcastConfig = {
  applePodcastsUrl: null,
  youtubeUrl: null,
  applicationEmail: null,
};
