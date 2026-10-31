/**
 * The AI footer Maya used to add to every draft ("… drafted this message,
 * but the thinking and intent behind it came from a real person. … just
 * better at putting it into words.") was removed entirely (Ty, 2026-10-31).
 * The backend no longer writes it and strips it on send
 * (todd-backend outreachDraftPolicy.service.js stripAiDisclaimer); this
 * keeps drafts stored before then from showing it. Every wording ended on
 * the same phrase, so that's what it matches.
 */
const MARKER = /better at putting it into words/i;
const FOOTER_BLOCK = /<(p|div)\b[^>]*>(?:(?!<\/?(?:p|div)\b)[\s\S])*?better at putting it into words(?:(?!<\/?(?:p|div)\b)[\s\S])*?<\/\1>\s*/gi;

export function stripAiFooter ( html: string ): string {
  const value = String( html || '' );
  if ( !MARKER.test( value ) ) return value;
  return value.replace( FOOTER_BLOCK, '' ).replace( /[^<>]*better at putting it into words[^<>]*/gi, '' ).trim();
}
