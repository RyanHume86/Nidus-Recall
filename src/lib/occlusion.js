import { genId } from '@/lib/dates'

// Design follows Image Occlusion Enhanced addon convention used in the medical
// Anki community (AnKing, Pepper Pharm). One card per occlusion region.
// imageId: Base44 Image entity id (preferred); imageUrl: legacy inline Base64
export const createOcclusionCards = (imageUrl, regions, deckName, imageId = null) => {
  const now = new Date().toISOString()
  return regions.map(region => ({
    id: genId(), front: region.label, back: region.label,
    cardType: 'image_occlusion',
    imageId,
    // Only store inline if not referencing an Image entity
    imageUrl:         imageId ? null : imageUrl,
    occlusionRegions: imageId ? null : regions,
    occlusionRegionId: region.id,
    clozeText: null, clozeIndex: null,
    deck: deckName, contentType: 'Factual', status: 'Active',
    interval: 1, reviewCount: 0, lapses: 0, ratingHistory: [],
    connects_to: [], stability: null, difficulty: null,
    nextReview: null, lastReview: null, elaboration: '',
    anchor: null, source: null, stakes_flag: false,
    prerequisite_card_id: null, tags: [], createdAt: now,
  }))
}
