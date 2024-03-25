
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
    resources: (list 5 int),  ;; wood rock food gold metal
    pawns: int,
    town: {
        defenses: (list 2 int), ;; hit-points / walls
        army: (list 3 int), ;; soldiers / archers / cavalry
    }
})
(define-map pawns-occupied-per-player { player: principal } {
    resources: (list 4 int)
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

        (map-set pawns-occupied-per-player {player: tx-sender}
            (merge player-mining-pawns {
                resources: (unwrap-panic (replace-at? (get resources player-mining-pawns) resource-to-gather assigned-pawns))
            })
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
        resources: (list 50 50 50 50 50), ;; wood rock food gold metal
        pawns: 100,
        town: {
            defenses: (list 20 20), ;; hit-points / walls
            army: (list 0 0 0) ;; soldiers / archers / cavalry
        }
    }
        (map-get? player-assets {player: player})
    )
)

(define-read-only (get-mining-pawns-per-player (player principal))
    (default-to {
        resources: (list 0 0 0 0)
    }
        (map-get? pawns-occupied-per-player {player: player})
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
;;

