export class SeatRegistry {
  private readonly bySeat = new Map<string, string>();
  private readonly byOwner = new Map<string, string>();

  claim(seatId: string, ownerId: string): boolean {
    if (this.bySeat.has(seatId) || this.byOwner.has(ownerId)) return false;
    this.bySeat.set(seatId, ownerId);
    this.byOwner.set(ownerId, seatId);
    return true;
  }
  release(ownerId: string): string | null {
    const seat = this.byOwner.get(ownerId);
    if (seat === undefined) return null;
    this.byOwner.delete(ownerId);
    this.bySeat.delete(seat);
    return seat;
  }
  occupant(seatId: string): string | null {
    return this.bySeat.get(seatId) ?? null;
  }
  seatOf(ownerId: string): string | null {
    return this.byOwner.get(ownerId) ?? null;
  }
}
