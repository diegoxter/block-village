
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
(define-constant err-not-enough-wood (err u24))
(define-constant err-not-enough-rock (err u25))

;; Invalid expedition errors
(define-constant err-invalid-expedition (err u30))
(define-constant err-metal-not-yet-refined (err u31))
(define-constant err-wood-rock-not-equal-share (err u32))
;;



;; data vars
(define-data-var campaign-id-tracker uint u1)
(define-data-var campaing-duration uint u5)
(define-data-var resource-mining-difficulty
    (list 5 uint) (list u2 u3 u3 u6 u12)) ;; wood / rock / food / gold
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
}})

(define-map expedition-tracker { player: principal, resource-id: uint } uint)

(define-map gathering-expeditions-per-player {
    player: principal,
    resource-id: uint, ;; can be wood / rock / food / gold / metal
    expedition-id: uint
    } { timestamp: uint, pawns-sent: int, refining: (list 2 int) }) ;; wood / rock
;;


;;
;; INITIAL CONTRACT STATE
(map-set campaigns {id: u0} { ;; empty campaign
    begins: u0,
    map-resources: (list 0 0 0 0),
    ends: u0})
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
            err-unended-previous-campaign)
        (asserts!
            (fold and
            (map more-than-zero map-resources) true) err-invalid-new-campaign-resources)
        (asserts! (is-eq (len map-resources) u4) err-invalid-new-campaign-resources)

        (map-insert campaigns {id: (var-get campaign-id-tracker)} {
            begins: (+ (get-current-time) u86400),
            map-resources: map-resources,
            ends: (+ (get-current-time) (* u86400 (var-get campaing-duration)))})

        (var-set campaign-id-tracker (+ (var-get campaign-id-tracker) u1))
        (print { object: "rts", action: "campaign-created", value: (some {
            begins: (+ (get-current-time) u86400),
            map-resources: map-resources,
            ends: (+ (get-current-time) (* u86400 u5))})})

        (ok true)
))

(define-public (send-gathering-expedition (assigned-pawns int) (resource-to-gather uint))
    (begin
        (asserts! (and (>= resource-to-gather u0) (<= resource-to-gather u3)) err-invalid-gathering-option)
        (let ((expedition (get-gathering-expeditions-per-player
            tx-sender resource-to-gather (get-expedition-tracker resource-to-gather))))
            (asserts! (> assigned-pawns 0) err-invalid-assigned-pawn-amount)
            (try! (check-can-gather assigned-pawns))

            (change-expedition-values-per-player
                resource-to-gather
                (get-expedition-tracker resource-to-gather)
                assigned-pawns
            )

            (map-set expedition-tracker
                {player: tx-sender, resource-id: resource-to-gather}
                (+ (get-expedition-tracker resource-to-gather) u1))

            (print (get-current-time))

            (ok true)
)))

(define-public (return-gathering-expedition
    (resource-to-gather uint) (expedition-id uint))
    (begin
        (asserts! (and (>= resource-to-gather u0) (<= resource-to-gather u3)) err-invalid-gathering-option)
        (let ((player (get-player tx-sender)) (expedition (get-gathering-expeditions-per-player
            tx-sender resource-to-gather expedition-id)))
            (asserts! (> (get timestamp expedition) u0) err-invalid-expedition)
            (asserts! (> (get pawns-sent expedition) 0) err-invalid-expedition)

            (return-pawns-and-resource-gathering resource-to-gather expedition-id)

            (print (- (get-current-time) (get timestamp expedition)))

            (reset-expedition-values resource-to-gather expedition-id)

            (if (is-eq (get-expedition-tracker resource-to-gather) expedition-id)
                (map-set expedition-tracker
                    {player: tx-sender, resource-id: resource-to-gather}
                    (- (get-expedition-tracker resource-to-gather) u1))
                false
            )

            (ok true)
)))

(define-public (refine-resources (wood-sent int) (rock-sent int))
    (let ((player (get-player tx-sender)) (expedition (get-gathering-expeditions-per-player
            tx-sender u4 u0)))
    (if (> (get timestamp expedition) u0)

        (begin ;; return pawns, giving the metal to the player
            (asserts! (>
                (- (get-current-time) (get timestamp expedition)) u1800)
                err-metal-not-yet-refined)

            (return-pawns-and-resource-gathering u4 u0)

            (reset-expedition-values u4 u0)

            (print (- (get-current-time) (get timestamp expedition)))

            (ok true))

        (begin ;; send pawns to the smelter, together with the wood and the rocks
            (asserts! (and
                ;; the player needs to hold the wood they are sending
                (>= (unwrap-panic (element-at? (get resources player) u0)) wood-sent)
                ;; wood must be at least 10
                (>= wood-sent 10)
                ;; wood must be a multiple of 10
                (is-eq (mod wood-sent 10) 0))
            err-not-enough-wood)
            (asserts! (and
                ;; the player needs to hold the rock they are sending
                (>= (unwrap-panic (element-at? (get resources player) u1)) rock-sent)
                ;; rock must be at least 7
                (>= rock-sent 7)
                ;; rock must be a multiple of 7
                (is-eq (mod rock-sent 7) 0))
            err-not-enough-rock)
            (asserts! (is-eq (/ rock-sent 7) (/ wood-sent 10)) err-wood-rock-not-equal-share)

            (map-set gathering-expeditions-per-player {
                    player: tx-sender,
                    resource-id: u4,
                    expedition-id: u0
                } (merge expedition {
                    refining: (list wood-sent rock-sent)
            }))
            (map-set player-assets {player: tx-sender}
                (merge player {
                    resources: (unwrap-panic (replace-at?
                    (unwrap-panic
                        (replace-at? (get resources player) u0 (- (unwrap-panic (element-at? (get resources player) u0)) wood-sent)
                    )) u1 (- (unwrap-panic (element-at? (get resources player) u1)) rock-sent)))
            }))
            (try! (check-can-gather 10))

            (change-expedition-values-per-player u4 u0 10)

            (print (get-current-time))

            (ok true)))
))
;;



;; read only functions
(define-read-only (get-campaign (campaign-id uint))
    (map-get? campaigns {id: campaign-id}))

(define-read-only (get-player (player principal))
    (default-to {
        resources: (list 50 50 50 50 50), ;; wood rock food gold metal
        pawns: 100,
        town: {
            defenses: (list 20 20), ;; hit-points / walls
            army: (list 0 0 0) ;; soldiers / archers / cavalry
    }}
        (map-get? player-assets {player: player})
))

(define-read-only (get-gathering-expeditions-per-player
    (player principal) (r-id uint) (e-id uint))
    (default-to { timestamp: u0, pawns-sent: 0, refining: (list 0 0) }
        (map-get? gathering-expeditions-per-player {
            player: player,
            resource-id: r-id, ;; can be wood / rock / food / gold
            expedition-id: e-id
})))

(define-read-only (get-resource-difficulty (r-id uint))
    (unwrap-panic (element-at? (var-get resource-mining-difficulty) r-id)))

(define-read-only (get-gathered-resource
    (sent-pawns int) (r-id uint) (time-gathering uint))
    (if (is-eq r-id u4) ;; if its metal we do a different calculation
        (/ (* ;; multiply wood and rock, dividing by the difficulty
            (unwrap-panic (element-at? (get refining (get-gathering-expeditions-per-player
            tx-sender u4 u0)) u0))
            (unwrap-panic (element-at? (get refining (get-gathering-expeditions-per-player
            tx-sender u4 u0)) u1))
            ) (to-int (get-resource-difficulty r-id)))
        (to-int (/
            (* (to-uint sent-pawns) (/ time-gathering u3600))
            (get-resource-difficulty r-id)
))))

(define-read-only (is-expedition-active (player principal) (r-id uint) (e-id uint))
    (and
        (>
            (get timestamp
                (get-gathering-expeditions-per-player player r-id e-id)) u0)
        (>
            (get pawns-sent
                (get-gathering-expeditions-per-player player r-id e-id)) 0)
))
;;



;; private functions
(define-private (get-current-time)
    (unwrap-panic (get-block-info? time (- block-height u1)))
)

(define-private (has-active-campaign)
    (<=
        (get-current-time)
        (get ends (unwrap-panic (get-campaign (- (var-get campaign-id-tracker) u1))))
))

(define-private (get-expedition-tracker (r-id uint))
    (default-to u0
        (map-get? expedition-tracker {player: tx-sender, resource-id: r-id}))
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

(ok true)))

(define-private (return-pawns-and-resource-gathering (r-id uint) (e-id uint))
    (map-set player-assets {player: tx-sender}
        (merge (get-player tx-sender) {
            resources: (unwrap-panic (replace-at?
                (get resources (get-player tx-sender))
                r-id
                (+  ;; the current resource amount
                    (unwrap-panic (element-at?
                        (get resources (get-player tx-sender)) r-id))
                    ;; the gathered amount
                    (get-gathered-resource
                        (get pawns-sent
                        (get-gathering-expeditions-per-player tx-sender r-id e-id))
                        r-id
                        (-
                        (get-current-time)
                        (get timestamp
                            (get-gathering-expeditions-per-player tx-sender r-id e-id)
            )))))),
            pawns: (+
            (get pawns (get-player tx-sender))
            (get pawns-sent (get-gathering-expeditions-per-player tx-sender r-id e-id))),
})))

(define-private (change-expedition-values-per-player (r-id uint) (e-id uint) (pawn-amount int))
    (map-set gathering-expeditions-per-player {
        player: tx-sender,
        resource-id: r-id,
        expedition-id: e-id
    } (merge (get-gathering-expeditions-per-player
        tx-sender r-id e-id) {
        pawns-sent: pawn-amount,
        timestamp: (get-current-time)
})))

(define-private (reset-expedition-values (r-id uint) (e-id uint))
    (map-set gathering-expeditions-per-player {
        player: tx-sender,
        resource-id: r-id,
        expedition-id: e-id
    } (merge (get-gathering-expeditions-per-player
        tx-sender r-id e-id) {
        timestamp: u0,
        pawns-sent: 0,
        refining: (list 0 0)
})))

(define-private (more-than-zero (num int)) (> num 0))
;;
