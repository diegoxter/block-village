
;; title: rts
;; version:
;; summary:
;; description:

;; traits
;;

;; token definitions
;;

;; constants
(define-constant err-invalid-campaign (err u0))
(define-constant err-unended-previous-campaign (err u1))
(define-constant err-no-active-campaign (err u2))


(define-constant err-invalid-player (err u20))
(define-constant err-invalid-assigned-pawn-amount (err u21))
(define-constant err-not-enough-pawns (err u22))
(define-constant err-invalid-gathering-option (err u23))
;;



;; data vars
(define-data-var campaign-id-tracker uint u1)
(define-data-var campaing-duration uint u5)
;;



;; data maps
(define-map campaigns { id: uint } { begins: uint, ends: uint })
(define-map player-assets { player: principal } {
    resources: {
        wood: int,
        rock: int,
        food: int,
        gold: int,
        metal: int
    },
    pawns: int,
    town: {
        hit-points: int,
        walls: int,
        soldiers: int,
    }
})
(define-map pawns-mining-resources-per-player { player: principal } {
    wood: int,
    rock: int,
    food: int,
    gold: int,
})
;;

(map-set campaigns {id: u0} { ;; empty campaign
    begins: u0,
    ends: u0
})


;; public functions
(define-public (create-campaign)
    (begin
        (asserts!
            (>=
                (get-current-time)
                (unwrap-panic (get ends (get-campaign (- (var-get campaign-id-tracker) u1))))
            )
            err-unended-previous-campaign
        )

        (map-insert campaigns {id: (var-get campaign-id-tracker)} {
            begins: (+ (get-current-time) u86400),
            ends: (+ (get-current-time) (* u86400 (var-get campaing-duration))),
        })

        (var-set campaign-id-tracker (+ (var-get campaign-id-tracker) u1))
        (print { object: "rts", action: "campaign-created", value: (some {
            begins: (+ (get-current-time) u86400),
            ends: (+ (get-current-time) (* u86400 u5)),
        }) })

        (ok true)
    )
)

(define-public (gather-resource (assigned-pawns int) (resource-to-gather uint))
    (let ((player-mining-pawns (get-mining-pawns-per-player tx-sender)))
        (asserts! (and (>= resource-to-gather u0) (<= resource-to-gather u3)) err-invalid-gathering-option)
        (asserts! (> assigned-pawns 0) err-invalid-assigned-pawn-amount)
        (try! (check-can-gather assigned-pawns))

        (if (is-eq resource-to-gather u0) ;; wood
           (assign-pawns-to-cut-wood assigned-pawns)
            (if (is-eq resource-to-gather u1) ;; rock
                (assign-pawns-to-mine-rock assigned-pawns)
                (if (is-eq resource-to-gather u2) ;; food
                    (assign-pawns-to-hunt-food assigned-pawns)
                    (if (is-eq resource-to-gather u3) ;; gold
                        (assign-pawns-to-mine-gold assigned-pawns)
                        false ;; default case
                    )
                )
            )
        )

        (ok true)
    )
)
;;



;; read only functions
(define-read-only (get-campaign (campaign-id uint))
    (map-get? campaigns {id: campaign-id})
)

(define-read-only (get-player (player principal))
    (default-to {
        resources: {
            wood: 50,
            rock: 50,
            food: 50,
            gold: 50,
            metal: 50
        },
        pawns: 100,
        town: {
            hit-points: 20,
            walls: 20,
            soldiers: 0
        }
    }
        (map-get? player-assets {player: player})
    )
)

(define-read-only (get-mining-pawns-per-player (player principal))
    (default-to {
            wood: 0,
            rock: 0,
            food: 0,
            gold: 0
        }
        (map-get? pawns-mining-resources-per-player {player: player})
    )
)
;;



;; private functions
(define-private (get-current-time)
    (unwrap-panic (get-block-info? time (- block-height u1)))
)

(define-private (has-active-campaign)
    (<=
        (get-current-time)
        (get ends (unwrap-panic (get-campaign (- (var-get campaign-id-tracker) u1))))
    )
)

(define-private (check-can-gather (assigned-pawns int))
    (let ((player (get-player tx-sender)))
        (asserts! (>= (get pawns player) assigned-pawns) err-not-enough-pawns)
        (asserts! (>= (- (get pawns player) assigned-pawns) 0) err-not-enough-pawns)
        (asserts! (has-active-campaign) err-no-active-campaign)

        (map-set player-assets {player: tx-sender}
            (merge player {
                pawns: (- (get pawns player) assigned-pawns),
            })
        )

        (ok true)
    )
)

(define-private (assign-pawns-to-cut-wood (assigned-pawns int))
    (let ((player-mining-pawns (get-mining-pawns-per-player tx-sender)))
        (map-set pawns-mining-resources-per-player {player: tx-sender}
            (merge player-mining-pawns {
                wood: (+ (get wood player-mining-pawns) assigned-pawns)
            })
        )
    )
)

(define-private (assign-pawns-to-mine-rock (assigned-pawns int))
    (let ((player-mining-pawns (get-mining-pawns-per-player tx-sender)))
        (map-set pawns-mining-resources-per-player {player: tx-sender}
            (merge player-mining-pawns {
                rock: (+ (get rock player-mining-pawns) assigned-pawns)
            })
        )
    )
)

(define-private (assign-pawns-to-mine-gold (assigned-pawns int))
    (let ((player-mining-pawns (get-mining-pawns-per-player tx-sender)))
        (map-set pawns-mining-resources-per-player {player: tx-sender}
            (merge player-mining-pawns {
                gold: (+ (get gold player-mining-pawns) assigned-pawns)
            })
        )
    )
)

(define-private (assign-pawns-to-hunt-food (assigned-pawns int))
    (let ((player-mining-pawns (get-mining-pawns-per-player tx-sender)))
        (map-set pawns-mining-resources-per-player {player: tx-sender}
            (merge player-mining-pawns {
                food: (+ (get food player-mining-pawns) assigned-pawns)
            })
        )
    )
)
;;

