
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
(define-constant err-invalid-new-campaign-resources (err u3))


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
(define-map campaigns { id: uint } {
    begins: uint,
    map-resources: (list 4 int), ;; wood / rock / food / gold
    ends: uint })

(define-map player-assets { player: principal } {
    resources: (list 5 int),  ;; wood rock food gold metal
    pawns: int,
    town: {
        defenses: (list 2 int), ;; hit-points / walls
        army: (list 3 int), ;; soldiers / archers / cavalry
    }
})

(define-map expedition-tracker { player: principal, resource-id: uint } uint)

(define-map gathering-expeditions-per-player {
    player: principal,
    resource-id: uint, ;; can be wood / rock / food / gold
    expedition-id: uint
    } { timestamp: uint, pawns-sent: int })
;;

(map-set campaigns {id: u0} { ;; empty campaign
    begins: u0,
    map-resources: (list 0 0 0 0),
    ends: u0
})


;; public functions
(define-public (create-campaign (map-resources (list 4 int)))
    (begin
        (asserts!
            (>=
                (get-current-time)
                (unwrap-panic (get ends (get-campaign (- (var-get campaign-id-tracker) u1))))
            )
            err-unended-previous-campaign
        )
        (asserts!
            (fold and
            (map more-than-zero map-resources) true) err-invalid-new-campaign-resources
        )
        (asserts! (is-eq (len map-resources) u4) (err u5))

        (map-insert campaigns {id: (var-get campaign-id-tracker)} {
            begins: (+ (get-current-time) u86400),
            map-resources: map-resources,
            ends: (+ (get-current-time) (* u86400 (var-get campaing-duration))),
        })

        (var-set campaign-id-tracker (+ (var-get campaign-id-tracker) u1))
        (print { object: "rts", action: "campaign-created", value: (some {
            begins: (+ (get-current-time) u86400),
            map-resources: map-resources,
            ends: (+ (get-current-time) (* u86400 u5)),
        }) })

        (ok true)
    )
)

(define-public (send-gathering-expedition (assigned-pawns int) (resource-to-gather uint))
    (begin
        (asserts! (and (>= resource-to-gather u0) (<= resource-to-gather u3)) err-invalid-gathering-option)
        (let ((player-mining-pawns (get-gathering-expeditions-per-player
            tx-sender resource-to-gather (get-expedition-tracker resource-to-gather))))
            (asserts! (> assigned-pawns 0) err-invalid-assigned-pawn-amount)
            (try! (check-can-gather assigned-pawns))

            (map-set gathering-expeditions-per-player {
                player: tx-sender, resource-id: resource-to-gather, expedition-id: (get-expedition-tracker resource-to-gather)}
                (merge player-mining-pawns {
                    pawns-sent: assigned-pawns,
                    timestamp: (get-current-time)
                })
            )

            (map-set expedition-tracker
                {player: tx-sender, resource-id: resource-to-gather}
                (+ (get-expedition-tracker resource-to-gather) u1)
            )

            (print (get-current-time))

            (ok true)
        )
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

(define-read-only (get-gathering-expeditions-per-player
    (player principal) (r-id uint) (e-id uint))
    (default-to { timestamp: u0, pawns-sent: 0 }
        (map-get? gathering-expeditions-per-player {
            player: player,
            resource-id: r-id, ;; can be wood / rock / food / gold
            expedition-id: e-id
        })
    )
)
;;


00
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

(define-private (get-expedition-tracker (r-id uint))
    (default-to u0
        (map-get? expedition-tracker {player: tx-sender, resource-id: r-id})
    )
)

(define-private (check-can-gather (assigned-pawns int))
    (let ((player (get-player tx-sender)))
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

(define-private (more-than-zero (num int))
    (> num 0)
)
;;
