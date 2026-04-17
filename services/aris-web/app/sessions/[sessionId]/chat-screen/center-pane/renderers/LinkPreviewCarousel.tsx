'use client';

import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CircleDot, ExternalLink, GitFork, GitPullRequest, Globe, Play } from 'lucide-react';
import styles from '../../../ChatInterface.module.css';

type SiteType = 'github_repo' | 'github_issue' | 'github_pr' | 'youtube' | 'generic';

interface LinkPreviewMeta {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
  favicon: string;
  siteType: SiteType;
  extra: Record<string, string>;
}

const LINK_URL_RE = /https?:\/\/[^\s)<>"'`\]]+/g;
const linkPreviewClientCache = new Map<string, LinkPreviewMeta>();

function extractExternalUrls(text: string): string[] {
  const matches = text.match(LINK_URL_RE);
  if (!matches) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of matches) {
    const url = raw.replace(/[.,;:!?)]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}

function proxyImageUrl(src: string): string {
  if (!src) return '';
  return `/api/link-preview/image?url=${encodeURIComponent(src)}`;
}

function useLinkPreviews(urls: string[]): LinkPreviewMeta[] {
  const [previews, setPreviews] = useState<LinkPreviewMeta[]>([]);
  const cacheKeyStr = urls.join('\n');

  useEffect(() => {
    if (urls.length === 0) {
      setPreviews([]);
      return;
    }

    let cancelled = false;

    async function load() {
      const results: LinkPreviewMeta[] = [];
      for (const url of urls) {
        const cached = linkPreviewClientCache.get(url);
        if (cached) {
          results.push(cached);
          continue;
        }
        try {
          const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
          if (!res.ok) {
            results.push({ url, title: '', description: '', image: '', siteName: '', favicon: '', siteType: 'generic', extra: {} });
            continue;
          }
          const meta: LinkPreviewMeta = await res.json();
          linkPreviewClientCache.set(url, meta);
          results.push(meta);
        } catch {
          results.push({ url, title: '', description: '', image: '', siteName: '', favicon: '', siteType: 'generic', extra: {} });
        }
      }
      if (!cancelled) setPreviews(results);
    }

    void load();
    return () => { cancelled = true; };
  }, [cacheKeyStr, urls]);

  return previews;
}

function tryParseHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function YouTubeCard({ meta }: { meta: LinkPreviewMeta }) {
  const videoId = meta.extra.videoId;
  const thumb = videoId
    ? proxyImageUrl(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`)
    : proxyImageUrl(meta.image);

  return (
    <a href={meta.url} target="_blank" rel="noreferrer noopener" className={`${styles.linkPreviewCard} ${styles.linkPreviewCardYoutube}`}>
      {thumb && (
        <div className={styles.linkPreviewImageWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumb} alt="" className={styles.linkPreviewImage} loading="lazy" onError={(event) => { (event.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
          <div className={styles.youtubePlayOverlay}>
            <Play size={28} fill="white" />
          </div>
        </div>
      )}
      <div className={styles.linkPreviewBody}>
        <div className={styles.linkPreviewSite}>
          <Play size={13} className={styles.youtubeIcon} />
          <span className={styles.linkPreviewSiteName}>YouTube</span>
        </div>
        {meta.title && <div className={styles.linkPreviewTitle}>{meta.title}</div>}
        {meta.description && <div className={styles.linkPreviewDesc}>{meta.description}</div>}
      </div>
    </a>
  );
}

function GitHubCard({ meta }: { meta: LinkPreviewMeta }) {
  const { siteType, extra } = meta;
  const repoLabel = extra.owner && extra.repo ? `${extra.owner}/${extra.repo}` : '';

  let TypeIcon = GitFork;
  let typeLabel = 'Repository';
  let badgeClass = styles.ghBadgeRepo;

  if (siteType === 'github_issue') {
    TypeIcon = CircleDot;
    typeLabel = extra.issueNumber ? `Issue #${extra.issueNumber}` : 'Issue';
    badgeClass = styles.ghBadgeIssue;
  } else if (siteType === 'github_pr') {
    TypeIcon = GitPullRequest;
    typeLabel = extra.prNumber ? `PR #${extra.prNumber}` : 'Pull Request';
    badgeClass = styles.ghBadgePr;
  }

  return (
    <a href={meta.url} target="_blank" rel="noreferrer noopener" className={`${styles.linkPreviewCard} ${styles.linkPreviewCardGithub}`}>
      {meta.image && (
        <div className={styles.linkPreviewImageWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImageUrl(meta.image)} alt="" className={styles.linkPreviewImage} loading="lazy" onError={(event) => { (event.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
        </div>
      )}
      <div className={styles.linkPreviewBody}>
        <div className={styles.linkPreviewSite}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImageUrl(meta.favicon || 'https://github.githubassets.com/favicons/favicon.svg')} alt="" className={styles.linkPreviewFavicon} width={14} height={14} onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          <span className={styles.linkPreviewSiteName}>{repoLabel || 'GitHub'}</span>
          <span className={`${styles.ghBadge} ${badgeClass}`}>
            <TypeIcon size={11} />
            {typeLabel}
          </span>
        </div>
        {meta.title && <div className={styles.linkPreviewTitle}>{meta.title}</div>}
        {meta.description && <div className={styles.linkPreviewDesc}>{meta.description}</div>}
      </div>
    </a>
  );
}

function GenericCard({ meta }: { meta: LinkPreviewMeta }) {
  return (
    <a href={meta.url} target="_blank" rel="noreferrer noopener" className={styles.linkPreviewCard}>
      {meta.image && (
        <div className={styles.linkPreviewImageWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxyImageUrl(meta.image)} alt="" className={styles.linkPreviewImage} loading="lazy" onError={(event) => { (event.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
        </div>
      )}
      <div className={styles.linkPreviewBody}>
        <div className={styles.linkPreviewSite}>
          {meta.favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImageUrl(meta.favicon)}
              alt=""
              className={styles.linkPreviewFavicon}
              width={14}
              height={14}
              onError={(event) => {
                event.currentTarget.style.display = 'none';
                (event.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty('display');
              }}
            />
          ) : null}
          <Globe size={14} className={styles.linkPreviewGlobe} style={meta.favicon ? { display: 'none' } : undefined} />
          <span className={styles.linkPreviewSiteName}>{meta.siteName || tryParseHostname(meta.url)}</span>
          <ExternalLink size={11} className={styles.linkPreviewExtIcon} />
        </div>
        {meta.title && <div className={styles.linkPreviewTitle}>{meta.title}</div>}
        {meta.description && <div className={styles.linkPreviewDesc}>{meta.description}</div>}
      </div>
    </a>
  );
}

function renderPreviewCard(meta: LinkPreviewMeta) {
  switch (meta.siteType) {
    case 'youtube':
      return <YouTubeCard key={meta.url} meta={meta} />;
    case 'github_repo':
    case 'github_issue':
    case 'github_pr':
      return <GitHubCard key={meta.url} meta={meta} />;
    default:
      return <GenericCard key={meta.url} meta={meta} />;
  }
}

export function LinkPreviewCarousel({ body }: { body: string }) {
  const urls = useMemo(() => extractExternalUrls(body), [body]);
  const previews = useLinkPreviews(urls);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 2);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    updateScrollState();
    element.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [previews.length, updateScrollState]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const element = scrollRef.current;
    if (!element) return;
    const firstCard = element.firstElementChild as HTMLElement | null;
    const trackStyles = window.getComputedStyle(element);
    const gapValue = trackStyles.columnGap || trackStyles.gap || '0';
    const gap = Number.parseFloat(gapValue) || 0;
    const cardWidth = firstCard?.getBoundingClientRect().width ?? Math.min(element.clientWidth, 296);
    const scrollAmount = cardWidth + gap;
    element.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  }, []);

  const meaningful = previews.filter((preview) =>
    preview.title || preview.description || preview.image ||
    preview.siteType === 'github_issue' || preview.siteType === 'github_pr' || preview.siteType === 'github_repo' ||
    preview.siteType === 'youtube',
  );
  if (meaningful.length === 0) return null;

  return (
    <div className={styles.linkPreviewWrap}>
      {canScrollLeft && (
        <button
          type="button"
          className={`${styles.linkPreviewNavBtn} ${styles.linkPreviewNavBtnLeft}`}
          onClick={() => scroll('left')}
          aria-label="이전 링크"
        >
          <ChevronLeft size={16} />
        </button>
      )}
      <div className={styles.linkPreviewTrack} ref={scrollRef}>
        {meaningful.map(renderPreviewCard)}
      </div>
      {canScrollRight && (
        <button
          type="button"
          className={`${styles.linkPreviewNavBtn} ${styles.linkPreviewNavBtnRight}`}
          onClick={() => scroll('right')}
          aria-label="다음 링크"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
