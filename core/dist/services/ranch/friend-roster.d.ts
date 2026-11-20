export interface RanchFriend {
    gid: number;
    name: string;
    avatarUrl: string;
    canSteal: boolean;
    canHelp: boolean;
    statusAtMs: number;
}
export declare function refreshRanchFriendStatus(friends: RanchFriend[], start: number): Promise<number[]>;
export declare function getRanchFriendList(checkpoint?: (completedBatch: boolean) => void): Promise<RanchFriend[]>;
//# sourceMappingURL=friend-roster.d.ts.map