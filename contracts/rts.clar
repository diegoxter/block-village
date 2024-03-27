
;; title: rts
;; version:
;; summary:
;; description:

;; traits
;;

;; token definitions
;;

;; constants

;; Invalid campaign errors
(define-constant err-invalid-campaign (err u0))
(define-constant err-unended-previous-campaign (err u1))
(define-constant err-no-active-campaign (err u2))
(define-constant err-invalid-new-campaign-resources (err u3))

;; Invalid user errors
(define-constant err-invalid-player (err u20))
(define-constant err-invalid-assigned-pawn-amount (err u21))
(define-constant err-not-enough-pawns (err u22))
(define-constant err-invalid-gathering-option (err u23))

;; Invalid expedition errors
(define-constant err-invalid-expedition (err u30))
;;



;; data vars
(define-data-var campaign-id-tracker uint u1)
(define-data-var campaing-duration uint u5)
(define-data-var resource-mining-difficulty
    (list 4 uint) (list u2 u3 u3 u6)) ;; wood / rock / food / gold
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


;;
;; INITIAL CONTRACT STATE
(map-set campaigns {id: u0} { ;; empty campaign
    begins: u0,
    map-resources: (list 0 0 0 0),
    ends: u0
})
;;
;;


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
        (asserts! (is-eq (len map-resources) u4) err-invalid-new-campaign-resources)

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

(define-public (return-gathering-expedition
    (resource-to-gather uint) (expedition-id uint))
    (begin
        (asserts! (and (>= resource-to-gather u0) (<= resource-to-gather u3)) err-invalid-gathering-option)
        (let ((expedition (get-gathering-expeditions-per-player
            tx-sender resource-to-gather expedition-id)))
            (asserts! (not (is-eq (get timestamp expedition) u0)) err-invalid-expedition)
            (asserts! (not (is-eq (get pawns-sent expedition) 0)) err-invalid-expedition)

            (map-set player-assets {player: tx-sender}
                (merge (get-player tx-sender) {
                    resources: (unwrap-panic (replace-at?
                        (get resources (get-player tx-sender))
                        resource-to-gather
                        (+  ;; the current resource amount
                            (unwrap-panic (element-at?
                                (get resources (get-player tx-sender)) resource-to-gather))
                            ;; the gathered amount
                            (get-gathered-resource
                                (get pawns-sent expedition)
                                resource-to-gather
                                (- (get-current-time) (get timestamp expedition))
                            )
                        )
                    )),
                    pawns: (+
                    (get pawns (get-player tx-sender)) (get pawns-sent expedition)),
                })
            )

            (print (- (get-current-time) (get timestamp expedition)))


            (map-set gathering-expeditions-per-player {
                player: tx-sender,
                resource-id: resource-to-gather,
                expedition-id: expedition-id
            } (merge expedition {
                timestamp: u0,
                pawns-sent: 0
            }))

            (if (is-eq
                (get-expedition-tracker resource-to-gather) expedition-id)
                (map-set expedition-tracker
                    {player: tx-sender, resource-id: resource-to-gather}
                    (- (get-expedition-tracker resource-to-gather) u1)
                )
                false
            )

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

(define-read-only (get-resource-difficulty (r-id uint))
    (unwrap-panic (element-at? (var-get resource-mining-difficulty) r-id))
)

(define-read-only (get-gathered-resource
    (sent-pawns int) (r-id uint) (time-gathering uint))
    (to-int (/
        (* (to-uint sent-pawns) (/ time-gathering u3600))
        (get-resource-difficulty r-id)
        )
    )
)

(define-read-only (is-expedition-active (player principal) (r-id uint) (e-id uint))
    (and
        (not (is-eq
            (get timestamp (get-gathering-expeditions-per-player
    player r-id e-id)) u0))
        (not (is-eq
            (get pawns-sent (get-gathering-expeditions-per-player
    player r-id e-id)) 0))
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
